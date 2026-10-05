'use client';

import {
  type AssistantChatInput,
  type AssistantEvent,
  MUTATING_ASSISTANT_TOOLS,
} from '@lifeos/contracts';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  type ReactNode,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { API_BASE_URL, ApiError, api } from './api-client';

export type MessagePart =
  | { kind: 'text'; text: string }
  | { kind: 'tool'; id: string; name: string; status: 'running' | 'done' | 'error' };

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  parts: MessagePart[];
  error?: string;
  pending?: boolean;
}

interface AssistantState {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
  messages: ChatMessage[];
  busy: boolean;
  send: (message: string, context?: string) => Promise<void>;
  stop: () => void;
  reset: () => void;
  status: ReturnType<typeof useAssistantStatus>;
}

const STORAGE_KEY = 'lifeos.assistant.v1';
const MAX_STORED_MESSAGES = 100;
const MUTATING = new Set<string>(MUTATING_ASSISTANT_TOOLS);

const AssistantContext = createContext<AssistantState | null>(null);

const newId = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

function load(): { messages: ChatMessage[]; sessionId: string | null; open: boolean } {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as {
        messages?: ChatMessage[];
        sessionId?: string | null;
        open?: boolean;
      };
      return {
        messages: (parsed.messages ?? []).map((m) => ({ ...m, pending: false })),
        sessionId: parsed.sessionId ?? null,
        open: parsed.open ?? false,
      };
    }
  } catch {
    // Storage unavailable or corrupt: start fresh.
  }
  return { messages: [], sessionId: null, open: false };
}

function useAssistantStatus() {
  return useQuery({
    queryKey: ['assistant-status'],
    queryFn: api.assistant.status,
    staleTime: 60_000,
  });
}

/** Reads a fetch body as Server-Sent Events, yielding each `data:` JSON payload. */
async function* readEvents(body: ReadableStream<Uint8Array>): AsyncGenerator<AssistantEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let idx: number;
    while ((idx = buffer.indexOf('\n\n')) >= 0) {
      const chunk = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const data = chunk
        .split('\n')
        .filter((l) => l.startsWith('data:'))
        .map((l) => l.slice(5).trimStart())
        .join('\n');
      if (data) yield JSON.parse(data) as AssistantEvent;
    }
  }
}

export function AssistantProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const status = useAssistantStatus();
  const [hydrated, setHydrated] = useState(false);
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [busy, setBusy] = useState(false);
  const sessionId = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Restore after mount (localStorage is browser-only).
  useEffect(() => {
    const saved = load();
    setMessages(saved.messages);
    setOpen(saved.open);
    sessionId.current = saved.sessionId;
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({
          messages: messages.slice(-MAX_STORED_MESSAGES),
          sessionId: sessionId.current,
          open,
        }),
      );
    } catch {
      // Persistence is a convenience only.
    }
  }, [messages, open, hydrated]);

  const updateLast = useCallback((fn: (m: ChatMessage) => ChatMessage) => {
    setMessages((prev) => {
      const last = prev.at(-1);
      return last && last.role === 'assistant' ? [...prev.slice(0, -1), fn(last)] : prev;
    });
  }, []);

  const send = useCallback(
    async (text: string, context?: string) => {
      const message = text.trim();
      if (!message || busy) return;
      setBusy(true);
      setMessages((prev) => [
        ...prev,
        { id: newId(), role: 'user', parts: [{ kind: 'text', text: message }] },
        { id: newId(), role: 'assistant', parts: [], pending: true },
      ]);

      const abort = new AbortController();
      abortRef.current = abort;
      let changedData = false;
      const body: AssistantChatInput = {
        message,
        sessionId: sessionId.current ?? undefined,
        context,
      };

      try {
        const res = await fetch(`${API_BASE_URL}/assistant/chat`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
          signal: abort.signal,
        });
        if (!res.ok || !res.body) {
          const err = (await res.json().catch(() => null)) as {
            error?: { message?: string };
          } | null;
          throw new Error(err?.error?.message ?? `The assistant returned ${res.status}`);
        }

        for await (const event of readEvents(res.body)) {
          switch (event.type) {
            case 'session':
              sessionId.current = event.sessionId;
              break;
            case 'text':
              updateLast((m) => {
                const parts = [...m.parts];
                const last = parts.at(-1);
                if (last?.kind === 'text')
                  parts[parts.length - 1] = { ...last, text: last.text + event.delta };
                else parts.push({ kind: 'text', text: event.delta });
                return { ...m, parts };
              });
              break;
            case 'tool_start':
              updateLast((m) => ({
                ...m,
                parts: [
                  ...m.parts,
                  { kind: 'tool', id: event.id, name: event.name, status: 'running' },
                ],
              }));
              break;
            case 'tool_end':
              updateLast((m) => ({
                ...m,
                parts: m.parts.map((p) => {
                  if (p.kind !== 'tool' || p.id !== event.id) return p;
                  if (!event.isError && MUTATING.has(p.name)) changedData = true;
                  return { ...p, status: event.isError ? 'error' : 'done' };
                }),
              }));
              if (changedData) void queryClient.invalidateQueries();
              break;
            case 'error':
              updateLast((m) => ({ ...m, error: event.message }));
              break;
            case 'done':
              if (event.sessionId) sessionId.current = event.sessionId;
              break;
          }
        }
      } catch (err) {
        if (!abort.signal.aborted) {
          const msg =
            err instanceof TypeError
              ? `Cannot reach the LifeOS API at ${API_BASE_URL}. Is it running?`
              : err instanceof Error
                ? err.message
                : String(err);
          updateLast((m) => ({ ...m, error: msg }));
        }
      } finally {
        updateLast((m) => ({
          ...m,
          pending: false,
          // A tool still marked running when the stream ended did not complete.
          parts: m.parts.map((p) =>
            p.kind === 'tool' && p.status === 'running' ? { ...p, status: 'error' } : p,
          ),
        }));
        if (changedData) void queryClient.invalidateQueries();
        abortRef.current = null;
        setBusy(false);
      }
    },
    [busy, queryClient, updateLast],
  );

  const stop = useCallback(() => abortRef.current?.abort(), []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    sessionId.current = null;
    setMessages([]);
  }, []);

  const value = useMemo<AssistantState>(
    () => ({
      open,
      setOpen,
      toggle: () => setOpen((o) => !o),
      messages,
      busy,
      send,
      stop,
      reset,
      status,
    }),
    [open, messages, busy, send, stop, reset, status],
  );

  return <AssistantContext.Provider value={value}>{children}</AssistantContext.Provider>;
}

export function useAssistant(): AssistantState {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error('useAssistant must be used inside <AssistantProvider>');
  return ctx;
}

export { ApiError };
