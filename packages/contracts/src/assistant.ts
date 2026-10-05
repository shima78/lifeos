import { z } from 'zod';

/** POST /assistant/chat body. */
export const assistantChatSchema = z.object({
  message: z.string().trim().min(1, 'Message is required').max(20000),
  /** Continue an earlier conversation. Omit to start a new one. */
  sessionId: z.string().trim().min(1).max(200).optional(),
  /** What the user is looking at (e.g. the open application), so "this one" can be resolved. */
  context: z.string().trim().max(2000).optional(),
});
export type AssistantChatInput = z.input<typeof assistantChatSchema>;
export type AssistantChatData = z.output<typeof assistantChatSchema>;

/**
 * Events streamed from POST /assistant/chat (Server-Sent Events, one JSON object per `data:` line).
 * An assistant turn is a sequence of text deltas interleaved with tool calls, ending in `done`.
 */
export type AssistantEvent =
  | { type: 'session'; sessionId: string }
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; id: string; name: string; input: unknown }
  | { type: 'tool_end'; id: string; isError: boolean }
  | { type: 'done'; sessionId: string | null; isError: boolean; durationMs: number | null }
  | { type: 'error'; message: string };

/** Tools that change data; the web app refreshes its queries after one of these succeeds. */
export const MUTATING_ASSISTANT_TOOLS = [
  'add_application',
  'update_application',
  'change_status',
  'add_event',
  'void_event',
] as const;

/** GET /assistant/status */
export interface AssistantStatusDto {
  available: boolean;
  claudeVersion: string | null;
  reason: string | null;
}
