'use client';

import { type ApplicationEventDto, type ApplicationStatus, STATUS_LABELS } from '@lifeos/contracts';
import { ArrowRight, CalendarClock, Ellipsis, Undo2 } from 'lucide-react';
import { EventIcon } from '@/components/event-icon';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate, formatDateTime, relativeDays } from '@/lib/format';
import { cn } from '@/lib/utils';

function statusChange(
  event: ApplicationEventDto,
): { from: ApplicationStatus; to: ApplicationStatus } | null {
  const m = event.metadata;
  if (event.type !== 'STATUS_CHANGED' || !m) return null;
  const { from, to } = m as { from?: unknown; to?: unknown };
  return typeof from === 'string' &&
    typeof to === 'string' &&
    from in STATUS_LABELS &&
    to in STATUS_LABELS
    ? { from: from as ApplicationStatus, to: to as ApplicationStatus }
    : null;
}

/** Vertical timeline, newest first. Voided events stay visible, struck through, with the reason. */
export function Timeline({
  events,
  onVoid,
}: {
  events: ApplicationEventDto[];
  onVoid: (event: ApplicationEventDto) => void;
}) {
  const now = new Date();
  return (
    <ol className="relative">
      {events.map((event, i) => {
        const voided = event.voidedAt !== null;
        const change = statusChange(event);
        const upcoming = event.scheduledFor && new Date(event.scheduledFor) > now;
        return (
          <li key={event.id} className="group relative flex gap-4 pb-6 last:pb-0">
            {/* Connector line */}
            {i < events.length - 1 && (
              <span
                className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border"
                aria-hidden
              />
            )}
            <EventIcon type={event.type} voided={voided} />

            <div className="min-w-0 flex-1 pt-1">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p
                    className={cn(
                      'font-medium leading-snug',
                      voided && 'text-muted-foreground line-through',
                    )}
                  >
                    {event.title}
                  </p>
                  <p
                    className="mt-0.5 text-xs text-muted-foreground"
                    title={formatDateTime(event.occurredAt)}
                  >
                    {formatDate(event.occurredAt)} · {relativeDays(event.occurredAt)}
                  </p>
                </div>
                {!voided && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label="Event actions"
                        className="-mt-1 shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
                      >
                        <Ellipsis />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onSelect={() => onVoid(event)}>
                        <Undo2 /> Void event…
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </div>

              <div className={cn('flex flex-col gap-2', voided && 'opacity-60')}>
                {change && (
                  <div
                    className={cn(
                      'mt-2 flex flex-wrap items-center gap-1.5',
                      voided && 'line-through',
                    )}
                  >
                    <StatusBadge status={change.from} />
                    <ArrowRight className="size-3.5 text-muted-foreground" />
                    <StatusBadge status={change.to} />
                  </div>
                )}
                {event.scheduledFor && (
                  <p
                    className={cn(
                      'mt-2 inline-flex w-fit items-center gap-1.5 rounded-md px-2 py-1 text-xs font-medium',
                      upcoming && !voided
                        ? 'bg-violet-50 text-violet-700 dark:bg-violet-500/15 dark:text-violet-300'
                        : 'bg-muted text-muted-foreground',
                      voided && 'line-through',
                    )}
                  >
                    <CalendarClock className="size-3.5" />
                    {formatDateTime(event.scheduledFor)}
                    {upcoming && ` · ${relativeDays(event.scheduledFor)}`}
                  </p>
                )}
                {event.description && (
                  <p
                    className={cn(
                      'text-sm whitespace-pre-line text-muted-foreground',
                      !change && !event.scheduledFor && 'mt-1.5',
                      voided && 'line-through',
                    )}
                  >
                    {event.description}
                  </p>
                )}
              </div>

              {voided && (
                <p className="mt-2 w-fit rounded-md bg-muted px-2 py-1 text-xs text-muted-foreground">
                  Voided {event.voidedAt && formatDate(event.voidedAt)}
                  {event.voidReason && <>: {event.voidReason}</>}
                </p>
              )}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
