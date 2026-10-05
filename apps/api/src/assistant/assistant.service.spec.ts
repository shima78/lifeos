import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AssistantEvent } from '@lifeos/contracts';
import { Clock } from '../common/clock';
import { AssistantPaths, AssistantService } from './assistant.service';
import { ClaudeRunner, type RunOptions } from './claude-runner';
import { StreamJsonParser } from './stream-json-parser';

const line = (o: unknown) => JSON.stringify(o);

/** Recorded shape of a turn in which Claude calls one LifeOS tool and then answers. */
const TOOL_TURN = [
  line({
    type: 'system',
    subtype: 'init',
    session_id: 'sess-1',
    mcp_servers: [{ name: 'lifeos', status: 'connected' }],
  }),
  line({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'Let me check. ' } },
  }),
  line({
    type: 'assistant',
    message: {
      content: [
        { type: 'text', text: 'Let me check. ' },
        {
          type: 'tool_use',
          id: 'tu_1',
          name: 'mcp__lifeos__list_applications',
          input: { search: 'Acme' },
        },
      ],
    },
  }),
  line({
    type: 'user',
    message: {
      content: [{ type: 'tool_result', tool_use_id: 'tu_1', is_error: false, content: '[]' }],
    },
  }),
  line({
    type: 'stream_event',
    event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'No Acme ' } },
  }),
  line({
    type: 'stream_event',
    event: {
      type: 'content_block_delta',
      delta: { type: 'text_delta', text: 'applications yet.' },
    },
  }),
  line({
    type: 'assistant',
    message: { content: [{ type: 'text', text: 'No Acme applications yet.' }] },
  }),
  line({ type: 'rate_limit_event' }),
  line({
    type: 'result',
    subtype: 'success',
    is_error: false,
    session_id: 'sess-1',
    result: 'No Acme applications yet.',
    duration_ms: 4200,
  }),
];

class FakeRunner extends ClaudeRunner {
  lastOptions: RunOptions | null = null;
  constructor(
    private readonly lines: string[],
    private readonly failWith?: Error,
  ) {
    super();
  }
  async *run(options: RunOptions): AsyncIterable<string> {
    this.lastOptions = options;
    for (const l of this.lines) yield l;
    if (this.failWith) throw this.failWith;
  }
  async version() {
    return '2.1.289 (Claude Code)';
  }
}

class FixedClock extends Clock {
  now() {
    return new Date('2026-10-04T10:00:00.000Z');
  }
}

/** A temp workspace with a stand-in MCP entry file, so tests don't depend on a build. */
class TempPaths extends AssistantPaths {
  private readonly dir = mkdtempSync(join(tmpdir(), 'lifeos-assistant-'));
  private readonly entry = join(this.dir, 'mcp.js');
  constructor() {
    super();
    writeFileSync(this.entry, '');
  }
  override mcpEntry() {
    return this.entry;
  }
  override workspaceDir() {
    return join(this.dir, 'workspace');
  }
}

async function collect(gen: AsyncIterable<AssistantEvent>): Promise<AssistantEvent[]> {
  const out: AssistantEvent[] = [];
  for await (const e of gen) out.push(e);
  return out;
}

describe('StreamJsonParser', () => {
  it('turns a tool-using turn into session, text, tool and done events', () => {
    const parser = new StreamJsonParser();
    const events = TOOL_TURN.flatMap((l) => parser.feed(l));

    expect(events).toEqual([
      { type: 'session', sessionId: 'sess-1' },
      { type: 'text', delta: 'Let me check. ' },
      { type: 'tool_start', id: 'tu_1', name: 'list_applications', input: { search: 'Acme' } },
      { type: 'tool_end', id: 'tu_1', isError: false },
      { type: 'text', delta: 'No Acme ' },
      { type: 'text', delta: 'applications yet.' },
      { type: 'done', sessionId: 'sess-1', isError: false, durationMs: 4200 },
    ]);
  });

  it('falls back to the final result text when no deltas were streamed', () => {
    const parser = new StreamJsonParser();
    const events = [
      line({ type: 'system', subtype: 'init', session_id: 's' }),
      line({ type: 'result', subtype: 'success', is_error: false, session_id: 's', result: 'Hi!' }),
    ].flatMap((l) => parser.feed(l));
    expect(events).toContainEqual({ type: 'text', delta: 'Hi!' });
  });

  it('reports a failed MCP server and an errored result', () => {
    const parser = new StreamJsonParser();
    const events = [
      line({
        type: 'system',
        subtype: 'init',
        session_id: 's',
        mcp_servers: [{ name: 'lifeos', status: 'failed' }],
      }),
      line({ type: 'result', subtype: 'error_during_execution', is_error: true, session_id: 's' }),
    ].flatMap((l) => parser.feed(l));
    expect(events.filter((e) => e.type === 'error')).toHaveLength(2);
    expect(events.at(-1)).toMatchObject({ type: 'done', isError: true });
  });

  it('ignores malformed and unknown lines', () => {
    const parser = new StreamJsonParser();
    expect(parser.feed('not json')).toEqual([]);
    expect(parser.feed(line({ type: 'rate_limit_event' }))).toEqual([]);
  });
});

describe('AssistantService', () => {
  it('runs Claude Code with only the LifeOS tools and no built-in tools', async () => {
    const runner = new FakeRunner(TOOL_TURN);
    const service = new AssistantService(runner, new FixedClock(), new TempPaths());

    const events = await collect(service.chat({ message: 'Do I have Acme apps?' }));
    expect(events.at(-1)).toMatchObject({ type: 'done', sessionId: 'sess-1' });

    const { args, stdin } = runner.lastOptions!;
    expect(stdin).toBe('Do I have Acme apps?');
    expect(args).toEqual(
      expect.arrayContaining(['-p', '--strict-mcp-config', '--include-partial-messages']),
    );
    expect(args[args.indexOf('--tools') + 1]).toBe('');
    expect(args[args.indexOf('--allowedTools') + 1]).toBe('mcp__lifeos');
    expect(args[args.indexOf('--system-prompt') + 1]).toContain('Today is 04 Oct 2026');
    expect(args).not.toContain('--bare'); // --bare would require an API key
    expect(args).not.toContain('--resume');
  });

  it('resumes an existing session', async () => {
    const runner = new FakeRunner(TOOL_TURN);
    await collect(
      new AssistantService(runner, new FixedClock(), new TempPaths()).chat({
        message: 'and now?',
        sessionId: 'sess-1',
      }),
    );
    const { args } = runner.lastOptions!;
    expect(args[args.indexOf('--resume') + 1]).toBe('sess-1');
  });

  it('turns a runner failure into an error event followed by done', async () => {
    const runner = new FakeRunner([], new Error('Claude Code CLI "claude" was not found.'));
    const events = await collect(
      new AssistantService(runner, new FixedClock(), new TempPaths()).chat({ message: 'hi' }),
    );
    expect(events).toEqual([
      { type: 'error', message: 'Claude Code CLI "claude" was not found.' },
      { type: 'done', sessionId: null, isError: true, durationMs: null },
    ]);
  });
});

describe('AssistantService session recovery', () => {
  /** First call (with --resume) fails like Claude Code does for an unknown session; later calls succeed. */
  class LostSessionRunner extends ClaudeRunner {
    calls: string[][] = [];
    async *run(options: RunOptions): AsyncIterable<string> {
      this.calls.push(options.args);
      if (options.args.includes('--resume')) {
        yield line({
          type: 'result',
          subtype: 'error_during_execution',
          is_error: true,
          duration_ms: 0,
        });
        throw new Error('No conversation found with session ID: gone');
      }
      for (const l of TOOL_TURN) yield l;
    }
    async version() {
      return 'test';
    }
  }

  it('starts a fresh conversation when the saved one no longer exists', async () => {
    const runner = new LostSessionRunner();
    const service = new AssistantService(runner, new FixedClock(), new TempPaths());

    const events = await collect(service.chat({ message: 'hi', sessionId: 'gone' }));

    expect(runner.calls).toHaveLength(2);
    expect(runner.calls[1]).not.toContain('--resume');
    expect(events.some((e) => e.type === 'error')).toBe(false);
    expect(events.at(-1)).toMatchObject({ type: 'done', sessionId: 'sess-1', isError: false });
  });

  it('does not retry when the resumed conversation works', async () => {
    const runner = new FakeRunner(TOOL_TURN);
    const service = new AssistantService(runner, new FixedClock(), new TempPaths());
    const events = await collect(service.chat({ message: 'hi', sessionId: 'sess-1' }));
    expect(events.filter((e) => e.type === 'done')).toHaveLength(1);
    expect(runner.lastOptions?.args).toContain('--resume');
  });
});
