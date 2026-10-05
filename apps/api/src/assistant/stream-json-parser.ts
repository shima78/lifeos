import type { AssistantEvent } from '@lifeos/contracts';

/** MCP server name the assistant's tools are registered under (tool names arrive as mcp__lifeos__x). */
export const MCP_SERVER_NAME = 'lifeos';
const TOOL_PREFIX = `mcp__${MCP_SERVER_NAME}__`;

export const displayToolName = (name: string): string =>
  name.startsWith(TOOL_PREFIX) ? name.slice(TOOL_PREFIX.length) : name;

type Json = Record<string, unknown>;
const isObj = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Converts Claude Code's `--output-format stream-json --include-partial-messages` lines into
 * AssistantEvents. Stateful: one parser per conversation turn.
 *
 * - Text comes from `stream_event` text deltas (live typing).
 * - Tool calls come from complete `assistant` messages (they carry the full input).
 * - Tool completion comes from `user` messages carrying `tool_result` blocks.
 * - `result` ends the turn. If no text delta was ever seen (partial messages unavailable),
 *   the final result text is emitted so the reply is never lost.
 */
export class StreamJsonParser {
  private sessionId: string | null = null;
  private sawText = false;

  feed(line: string): AssistantEvent[] {
    let msg: unknown;
    try {
      msg = JSON.parse(line);
    } catch {
      return [];
    }
    if (!isObj(msg)) return [];

    switch (msg.type) {
      case 'system':
        return this.onSystem(msg);
      case 'stream_event':
        return this.onStreamEvent(msg);
      case 'assistant':
        return this.onAssistant(msg);
      case 'user':
        return this.onUser(msg);
      case 'result':
        return this.onResult(msg);
      default:
        return [];
    }
  }

  private onSystem(msg: Json): AssistantEvent[] {
    if (msg.subtype !== 'init' || typeof msg.session_id !== 'string') return [];
    this.sessionId = msg.session_id;
    const events: AssistantEvent[] = [{ type: 'session', sessionId: msg.session_id }];
    const servers = Array.isArray(msg.mcp_servers) ? msg.mcp_servers : [];
    const lifeos = servers.find((s) => isObj(s) && s.name === MCP_SERVER_NAME);
    if (isObj(lifeos) && lifeos.status !== 'connected') {
      events.push({
        type: 'error',
        message: `The LifeOS tools are unavailable (MCP server status: ${String(lifeos.status)}).`,
      });
    }
    return events;
  }

  private onStreamEvent(msg: Json): AssistantEvent[] {
    const event = msg.event;
    if (!isObj(event) || event.type !== 'content_block_delta' || !isObj(event.delta)) return [];
    if (event.delta.type !== 'text_delta' || typeof event.delta.text !== 'string') return [];
    if (!event.delta.text) return [];
    this.sawText = true;
    return [{ type: 'text', delta: event.delta.text }];
  }

  private onAssistant(msg: Json): AssistantEvent[] {
    const content =
      isObj(msg.message) && Array.isArray(msg.message.content) ? msg.message.content : [];
    return content
      .filter((b): b is Json => isObj(b) && b.type === 'tool_use' && typeof b.id === 'string')
      .map((b) => ({
        type: 'tool_start' as const,
        id: b.id as string,
        name: displayToolName(String(b.name ?? 'tool')),
        input: b.input ?? null,
      }));
  }

  private onUser(msg: Json): AssistantEvent[] {
    const content =
      isObj(msg.message) && Array.isArray(msg.message.content) ? msg.message.content : [];
    return content
      .filter(
        (b): b is Json => isObj(b) && b.type === 'tool_result' && typeof b.tool_use_id === 'string',
      )
      .map((b) => ({
        type: 'tool_end' as const,
        id: b.tool_use_id as string,
        isError: b.is_error === true,
      }));
  }

  private onResult(msg: Json): AssistantEvent[] {
    const events: AssistantEvent[] = [];
    const isError = msg.is_error === true;
    if (typeof msg.session_id === 'string') this.sessionId = msg.session_id;
    if (!this.sawText && typeof msg.result === 'string' && msg.result && !isError) {
      events.push({ type: 'text', delta: msg.result });
    }
    if (isError) {
      const detail =
        typeof msg.result === 'string' && msg.result ? msg.result : String(msg.subtype);
      events.push({ type: 'error', message: `Claude could not finish: ${detail}` });
    }
    events.push({
      type: 'done',
      sessionId: this.sessionId,
      isError,
      durationMs: typeof msg.duration_ms === 'number' ? msg.duration_ms : null,
    });
    return events;
  }
}
