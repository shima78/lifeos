import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  type AssistantChatData,
  type AssistantEvent,
  type AssistantStatusDto,
  formatDate,
} from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { findRepoRoot } from '../common/load-env';
import { ClaudeRunner } from './claude-runner';
import { MCP_SERVER_NAME, StreamJsonParser } from './stream-json-parser';

const systemPrompt = (today: string) =>
  [
    "You are the assistant inside LifeOS, the user's personal dashboard. It tracks their job",
    "search (companies, applications and each application's timeline) and their tasks.",
    '',
    `Today is ${today} (Europe/Berlin).`,
    '',
    'Use the LifeOS tools to read and change data. Never say you changed something unless the tool',
    'call succeeded; if a tool returns an error, explain it plainly.',
    '- When the user says they applied to or want to save a job, call add_application (pass the URL',
    '  when given; duplicates are detected automatically and you should say so if one is found).',
    '- To update an existing application, find it first with list_applications (search by company',
    '  or title) unless you already have its id. If several match, ask which one.',
    '- Use change_status for status changes and add_event for recruiter contact, interviews',
    '  (scheduledFor is required for a scheduled interview), follow-ups and notes.',
    '- For to-dos and reminders ("remind me to…", "I need to…") use add_task with a dueDate when a',
    '  day is mentioned; link it to an application (applicationId) when it is about one. Mark tasks',
    '  done with update_task (status DONE). Use list_tasks with bucket ["overdue", "today"] for',
    '  "what do I have to do today?". Only delete a task when the user asks.',
    '',
    'Keep replies short and friendly. Use markdown (short lists, small tables) when it helps.',
  ].join('\n');

/** Where the built MCP server and the assistant's working directory live. Injectable for tests. */
@Injectable()
export class AssistantPaths {
  /** The compiled MCP server, or null when the repo root can't be found. */
  mcpEntry(): string | null {
    const root = findRepoRoot();
    return root ? resolve(root, 'apps/api/dist/mcp.js') : null;
  }

  /** Claude Code stores sessions per working directory, so --resume needs a fixed one. */
  workspaceDir(): string | null {
    const root = findRepoRoot();
    return root ? resolve(root, '.lifeos/assistant') : null;
  }
}

/**
 * Chat with Claude through the user's local Claude Code CLI (their own subscription login; no API
 * key). Claude gets only the LifeOS MCP tools: built-in file/shell tools are disabled.
 */
@Injectable()
export class AssistantService {
  constructor(
    private readonly runner: ClaudeRunner,
    private readonly clock: Clock,
    private readonly paths: AssistantPaths,
  ) {}

  async status(): Promise<AssistantStatusDto> {
    const mcpEntry = this.paths.mcpEntry();
    const claudeVersion = await this.runner.version();
    if (!claudeVersion) {
      return {
        available: false,
        claudeVersion,
        reason: 'Claude Code CLI not found. Install Claude Code and run `claude` once to log in.',
      };
    }
    if (!mcpEntry || !existsSync(mcpEntry)) {
      return {
        available: false,
        claudeVersion,
        reason: 'The API is not built yet. Run `pnpm build`.',
      };
    }
    return { available: true, claudeVersion, reason: null };
  }

  /** One user turn. Yields events until `done` (or `error` then `done`). */
  async *chat(input: AssistantChatData, signal?: AbortSignal): AsyncGenerator<AssistantEvent> {
    const workspace = this.prepareWorkspace();
    if (!workspace) {
      yield { type: 'error', message: 'The API is not built yet. Run `pnpm build` and try again.' };
      yield { type: 'done', sessionId: input.sessionId ?? null, isError: true, durationMs: null };
      return;
    }

    const stdin = input.context ? `[Context: ${input.context}]\n\n${input.message}` : input.message;

    if (input.sessionId) {
      // A saved conversation can disappear (cleared Claude Code history, another machine). If the
      // resume fails before Claude produced anything, start a fresh conversation instead of
      // leaving the chat stuck; the new session id is returned as usual.
      const attempt = await this.collectUntilStarted(
        this.turn(workspace, input.sessionId, stdin, signal),
      );
      if (attempt.started) {
        yield* attempt.events;
        return;
      }
      if (signal?.aborted) return;
    }
    yield* this.turn(workspace, undefined, stdin, signal);
  }

  /**
   * Buffers a turn's events until it has clearly started (a session init or any output), so a
   * failed resume can be retried without the client ever seeing the failure.
   */
  private async collectUntilStarted(
    turn: AsyncGenerator<AssistantEvent>,
  ): Promise<{ started: boolean; events: AsyncGenerator<AssistantEvent> }> {
    const buffered: AssistantEvent[] = [];
    for (;;) {
      const next = await turn.next();
      if (next.done) return { started: false, events: (async function* () {})() };
      buffered.push(next.value);
      if (
        next.value.type === 'session' ||
        next.value.type === 'text' ||
        next.value.type === 'tool_start'
      ) {
        return {
          started: true,
          events: (async function* () {
            yield* buffered;
            yield* turn;
          })(),
        };
      }
    }
  }

  /** Runs one Claude Code invocation and yields its events, always ending with `done`. */
  private async *turn(
    workspace: { dir: string; mcpConfig: string },
    sessionId: string | undefined,
    stdin: string,
    signal?: AbortSignal,
  ): AsyncGenerator<AssistantEvent> {
    const args = [
      '-p',
      '--output-format',
      'stream-json',
      '--verbose',
      '--include-partial-messages',
      '--tools',
      '',
      '--mcp-config',
      workspace.mcpConfig,
      '--strict-mcp-config',
      '--allowedTools',
      `mcp__${MCP_SERVER_NAME}`,
      '--system-prompt',
      systemPrompt(formatDate(this.clock.now())),
    ];
    if (sessionId) args.push('--resume', sessionId);

    const parser = new StreamJsonParser();
    let finished = false;
    try {
      for await (const line of this.runner.run({ args, stdin, cwd: workspace.dir, signal })) {
        for (const event of parser.feed(line)) {
          if (event.type === 'done') finished = true;
          yield event;
        }
      }
    } catch (err) {
      // After `done` the turn is complete; a late non-zero exit adds nothing useful.
      if (signal?.aborted || finished) return;
      yield { type: 'error', message: err instanceof Error ? err.message : String(err) };
    }
    if (!finished && !signal?.aborted) {
      yield { type: 'done', sessionId: sessionId ?? null, isError: true, durationMs: null };
    }
  }

  /** Creates the working directory and an MCP config pointing at the built LifeOS server. */
  private prepareWorkspace(): { dir: string; mcpConfig: string } | null {
    const entry = this.paths.mcpEntry();
    const dir = this.paths.workspaceDir();
    if (!entry || !dir || !existsSync(entry)) return null;
    mkdirSync(dir, { recursive: true });
    const mcpConfig = resolve(dir, 'mcp.json');
    const config = {
      mcpServers: {
        [MCP_SERVER_NAME]: { type: 'stdio', command: process.execPath, args: [entry] },
      },
    };
    writeFileSync(mcpConfig, JSON.stringify(config, null, 2));
    return { dir, mcpConfig };
  }
}
