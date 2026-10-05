'use client';

import type { ApplicationDto } from '@lifeos/contracts';
import { useQueryClient } from '@tanstack/react-query';
import {
  ArrowUp,
  CircleAlert,
  CircleCheck,
  CircleX,
  LoaderCircle,
  RotateCcw,
  Sparkles,
  Square,
  X,
} from 'lucide-react';
import { usePathname } from 'next/navigation';
import { type KeyboardEvent, useEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { Button } from '@/components/ui/button';
import { type ChatMessage, type MessagePart, useAssistant } from '@/lib/assistant';
import { queryKeys } from '@/lib/queries';
import { cn } from '@/lib/utils';

const TOOL_LABELS: Record<string, [running: string, done: string]> = {
  add_application: ['Adding application', 'Added application'],
  update_application: ['Updating application', 'Updated application'],
  change_status: ['Changing status', 'Changed status'],
  add_event: ['Adding to timeline', 'Added to timeline'],
  void_event: ['Voiding event', 'Voided event'],
  list_applications: ['Searching applications', 'Searched applications'],
  get_application: ['Opening application', 'Opened application'],
  list_companies: ['Looking up companies', 'Looked up companies'],
  get_dashboard: ['Reading dashboard', 'Read dashboard'],
};

const SUGGESTIONS = [
  'What needs my attention this week?',
  'Which applications have had no response for 2+ weeks?',
  'I just applied to a Frontend Engineer role at Acme in Berlin',
  'Summarise my rejections so far',
];

/** Describes the page the user is on, so "this application" can be resolved by Claude. */
function usePageContext(): string | undefined {
  const pathname = usePathname();
  const queryClient = useQueryClient();
  const match = pathname.match(/^\/applications\/([^/]+)(\/edit)?$/);
  if (!match || match[1] === 'new') return undefined;
  const app = queryClient.getQueryData<ApplicationDto>(queryKeys.application(match[1]!));
  return app
    ? `The user is viewing application id ${app.id}: "${app.title}" at ${app.company.name} (status ${app.status}).`
    : `The user is viewing application id ${match[1]}.`;
}

function ToolChip({ part }: { part: Extract<MessagePart, { kind: 'tool' }> }) {
  const [running, done] = TOOL_LABELS[part.name] ?? [`Using ${part.name}`, `Used ${part.name}`];
  return (
    <span
      className={cn(
        'inline-flex w-fit items-center gap-1.5 rounded-md border bg-card px-2 py-1 text-xs text-muted-foreground',
        part.status === 'error' && 'border-signal-critical/40',
      )}
    >
      {part.status === 'running' ? (
        <LoaderCircle className="size-3.5 animate-spin" />
      ) : part.status === 'done' ? (
        <CircleCheck className="size-3.5 text-signal-good" />
      ) : (
        <CircleX className="size-3.5 text-signal-critical" />
      )}
      {part.status === 'running'
        ? `${running}…`
        : part.status === 'done'
          ? done
          : `${running} failed`}
    </span>
  );
}

function Message({ message }: { message: ChatMessage }) {
  if (message.role === 'user') {
    const text = message.parts.map((p) => (p.kind === 'text' ? p.text : '')).join('');
    return (
      <div className="flex justify-end">
        <p className="max-w-[85%] rounded-2xl rounded-br-md bg-primary px-3.5 py-2 text-sm whitespace-pre-wrap text-primary-foreground">
          {text}
        </p>
      </div>
    );
  }
  const empty = message.parts.length === 0;
  return (
    <div className="flex flex-col gap-2">
      {message.parts.map((part, i) =>
        part.kind === 'text' ? (
          <div key={i} className="chat-md">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{part.text}</ReactMarkdown>
          </div>
        ) : (
          <ToolChip key={part.id} part={part} />
        ),
      )}
      {message.pending && empty && (
        <span className="inline-flex items-center gap-2 text-sm text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" /> Thinking…
        </span>
      )}
      {message.error && (
        <p className="flex items-start gap-2 rounded-md border border-signal-critical/30 bg-signal-critical/5 px-3 py-2 text-sm">
          <CircleAlert className="mt-0.5 size-4 shrink-0 text-signal-critical" />
          <span>{message.error}</span>
        </p>
      )}
    </div>
  );
}

export function AssistantPanel({ className }: { className?: string }) {
  const { messages, busy, send, stop, reset, setOpen, status } = useAssistant();
  const context = usePageContext();
  const [draft, setDraft] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const submit = (text = draft) => {
    if (!text.trim() || busy) return;
    setDraft('');
    void send(text, context);
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      submit();
    }
  };

  const unavailable = status.data && !status.data.available;

  return (
    <section
      aria-label="Assistant"
      className={cn('flex h-full min-h-0 flex-col bg-card', className)}
    >
      <header className="flex h-14 shrink-0 items-center justify-between border-b px-4">
        <div className="flex items-center gap-2">
          <span className="grid size-7 place-items-center rounded-md bg-primary/10 text-primary">
            <Sparkles className="size-4" />
          </span>
          <div className="leading-tight">
            <p className="text-sm font-semibold">Assistant</p>
            <p className="text-xs text-muted-foreground">Claude, with your LifeOS data</p>
          </div>
        </div>
        <div className="flex items-center">
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={reset}
            disabled={messages.length === 0}
            aria-label="New conversation"
            title="New conversation"
          >
            <RotateCcw />
          </Button>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={() => setOpen(false)}
            aria-label="Close assistant"
          >
            <X />
          </Button>
        </div>
      </header>

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
        {unavailable && (
          <p className="mb-4 flex items-start gap-2 rounded-md border bg-muted px-3 py-2 text-sm">
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-signal-serious" />
            <span>Assistant unavailable: {status.data?.reason}</span>
          </p>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col gap-4 pt-6">
            <div>
              <p className="font-medium">How can I help?</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Ask about your applications, or tell me what happened. I can add applications,
                change statuses and log interviews for you.
              </p>
            </div>
            <div className="flex flex-col gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => submit(s)}
                  disabled={busy || unavailable}
                  className="cursor-pointer rounded-lg border bg-background px-3 py-2 text-left text-sm transition-colors hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-5">
            {messages.map((m) => (
              <Message key={m.id} message={m} />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t p-3">
        <div className="flex items-end gap-2 rounded-xl border bg-background p-2 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/30">
          <textarea
            ref={inputRef}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKeyDown}
            rows={1}
            placeholder={context ? 'Ask about this application…' : 'Message the assistant…'}
            aria-label="Message"
            className="max-h-40 min-h-9 flex-1 resize-none bg-transparent px-1.5 py-1.5 text-sm outline-none [field-sizing:content] placeholder:text-muted-foreground"
          />
          {busy ? (
            <Button size="icon-sm" variant="secondary" onClick={stop} aria-label="Stop">
              <Square className="fill-current" />
            </Button>
          ) : (
            <Button
              size="icon-sm"
              onClick={() => submit()}
              disabled={!draft.trim()}
              aria-label="Send"
            >
              <ArrowUp />
            </Button>
          )}
        </div>
        <p className="mt-2 px-1 text-[11px] text-muted-foreground">
          Runs Claude Code on your subscription · Enter to send, Shift+Enter for a new line
        </p>
      </div>
    </section>
  );
}
