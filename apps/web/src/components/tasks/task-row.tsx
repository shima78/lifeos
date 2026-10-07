'use client';

import {
  TASK_PRIORITY_LABELS,
  type TaskDto,
  calendarDaysBetween,
  toBerlinDateString,
} from '@lifeos/contracts';
import {
  Briefcase,
  Circle,
  CircleCheck,
  CircleDot,
  Ellipsis,
  Flag,
  Pencil,
  RotateCcw,
  Trash2,
} from 'lucide-react';
import Link from 'next/link';
import { toast } from 'sonner';
import { TruncatedText } from '@/components/truncated-text';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { formatDate } from '@/lib/format';
import { useDeleteTask, useUpdateTask } from '@/lib/queries';
import { cn } from '@/lib/utils';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** "Today", "Tomorrow", "Yesterday", "Thu 09 Oct" (Berlin calendar days). */
export function dueLabel(dueDate: string): string {
  const days = calendarDaysBetween(new Date(), dueDate);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  const weekday = WEEKDAYS[new Date(`${toBerlinDateString(dueDate)}T12:00:00Z`).getUTCDay()];
  return `${weekday} ${formatDate(dueDate).slice(0, 6)}`;
}

export function TaskRow({
  task,
  onEdit,
  showApplication = true,
}: {
  task: TaskDto;
  onEdit: (task: TaskDto) => void;
  showApplication?: boolean;
}) {
  const update = useUpdateTask();
  const remove = useDeleteTask();
  const done = task.status === 'DONE';

  const setStatus = (status: TaskDto['status']) =>
    update.mutate({ id: task.id, status }, { onError: (err) => toast.error(err.message) });

  const onDelete = () =>
    remove.mutate(task.id, {
      onSuccess: () => toast.success('Task deleted'),
      onError: (err) => toast.error(err.message),
    });

  const StatusIcon = done ? CircleCheck : task.status === 'IN_PROGRESS' ? CircleDot : Circle;

  return (
    <li className="group flex items-start gap-3 rounded-lg px-2 py-2 transition-colors hover:bg-accent/60">
      <button
        type="button"
        onClick={() => setStatus(done ? 'TODO' : 'DONE')}
        disabled={update.isPending}
        aria-label={done ? `Mark "${task.title}" as not done` : `Mark "${task.title}" as done`}
        className={cn(
          'mt-0.5 shrink-0 cursor-pointer rounded-full text-muted-foreground transition-colors hover:text-primary disabled:opacity-50',
          done && 'text-signal-good hover:text-signal-good',
          task.status === 'IN_PROGRESS' && 'text-primary',
        )}
      >
        <StatusIcon className="size-[18px]" />
      </button>

      <div className="min-w-0 flex-1">
        <button
          type="button"
          onClick={() => onEdit(task)}
          className="block w-full cursor-pointer text-left"
        >
          <TruncatedText
            text={task.title}
            className={cn('text-sm', done && 'text-muted-foreground line-through')}
          />
        </button>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-muted-foreground">
          {task.dueDate && (
            <span
              className={cn(
                task.bucket === 'overdue' && 'font-medium text-destructive',
                task.bucket === 'today' && 'font-medium text-foreground',
              )}
              title={formatDate(task.dueDate)}
            >
              {task.bucket === 'overdue'
                ? `Overdue · ${dueLabel(task.dueDate)}`
                : dueLabel(task.dueDate)}
            </span>
          )}
          {task.priority !== 'MEDIUM' && !done && (
            <span className="inline-flex items-center gap-1">
              <Flag
                className={cn(
                  'size-3',
                  task.priority === 'HIGH' ? 'text-signal-critical' : 'text-muted-foreground',
                )}
                aria-hidden
              />
              {TASK_PRIORITY_LABELS[task.priority]}
            </span>
          )}
          {task.status === 'IN_PROGRESS' && <span className="text-primary">In progress</span>}
          {showApplication && task.application && (
            <Link
              href={`/applications/${task.application.id}`}
              className="inline-flex min-w-0 items-center gap-1 hover:text-foreground"
            >
              <Briefcase className="size-3 shrink-0" aria-hidden />
              <span className="truncate">
                {task.application.company.name} · {task.application.title}
              </span>
            </Link>
          )}
          {task.notes && <span className="truncate">{task.notes}</span>}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label={`Actions for "${task.title}"`}
            className="-my-1 shrink-0 opacity-60 group-hover:opacity-100 focus-visible:opacity-100"
          >
            <Ellipsis />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={() => onEdit(task)}>
            <Pencil /> Edit
          </DropdownMenuItem>
          {task.status === 'TODO' && (
            <DropdownMenuItem onSelect={() => setStatus('IN_PROGRESS')}>
              <CircleDot /> Mark in progress
            </DropdownMenuItem>
          )}
          {task.status !== 'TODO' && (
            <DropdownMenuItem onSelect={() => setStatus('TODO')}>
              <RotateCcw /> Back to to do
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDelete} className="text-destructive">
            <Trash2 /> Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  );
}
