import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { Injectable } from '@nestjs/common';

export interface RunOptions {
  args: string[];
  stdin: string;
  cwd: string;
  signal?: AbortSignal;
}

/** Runs the Claude Code CLI and yields its stdout line by line. Abstract so tests can fake it. */
export abstract class ClaudeRunner {
  abstract run(options: RunOptions): AsyncIterable<string>;
  abstract version(): Promise<string | null>;
}

/** The local `claude` binary (override with CLAUDE_BIN). Uses the user's own Claude Code login. */
@Injectable()
export class ClaudeCliRunner extends ClaudeRunner {
  private get bin(): string {
    return process.env.CLAUDE_BIN || 'claude';
  }

  async *run({ args, stdin, cwd, signal }: RunOptions): AsyncIterable<string> {
    const child = spawn(this.bin, args, { cwd, signal, windowsHide: true, env: process.env });
    let stderr = '';
    child.stderr.on('data', (d: Buffer) => {
      stderr = (stderr + d.toString()).slice(-4000);
    });
    const exited = new Promise<number | null>((resolve, reject) => {
      child.on('error', reject);
      child.on('close', resolve);
    });
    // Keep a spawn failure (e.g. ENOENT) from surfacing as an unhandled rejection before we await it.
    exited.catch(() => undefined);

    child.stdin.end(stdin);
    for await (const line of createInterface({ input: child.stdout })) {
      if (line.trim()) yield line;
    }

    let code: number | null;
    try {
      code = await exited;
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error(
          `Claude Code CLI "${this.bin}" was not found. Install Claude Code and log in, or set CLAUDE_BIN.`,
        );
      }
      throw err;
    }
    if (code !== 0 && !signal?.aborted) {
      throw new Error(stderr.trim() || `Claude Code exited with code ${code}`);
    }
  }

  async version(): Promise<string | null> {
    try {
      let out = '';
      for await (const line of this.run({ args: ['--version'], stdin: '', cwd: process.cwd() })) {
        out += line;
      }
      return out.trim() || null;
    } catch {
      return null;
    }
  }
}
