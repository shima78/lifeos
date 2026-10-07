'use client';

import type { TaskBucket, TaskDto } from '@lifeos/contracts';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useState } from 'react';
import { cn } from '@/lib/utils';
import { TaskDialog } from './task-dialog';
import { TaskRow } from './task-row';

const SECTIONS: { bucket: TaskBucket; label: string }[] = [
  { bucket: 'overdue', label: 'Overdue' },
  { bucket: 'today', label: 'Today' },
  { bucket: 'upcoming', label: 'Upcoming' },
  { bucket: 'someday', label: 'No date' },
  { bucket: 'done', label: 'Completed' },
];

/** Shared edit dialog state for any list of task rows. */
function useEditDialog() {
  const [editing, setEditing] = useState<TaskDto | null>(null);
  const dialog = (
    <TaskDialog
      open={editing !== null}
      onOpenChange={(o) => !o && setEditing(null)}
      task={editing}
    />
  );
  return { onEdit: setEditing, dialog };
}

/** A flat list of tasks (already sorted by the API). */
export function TaskList({
  tasks,
  showApplication = true,
}: {
  tasks: TaskDto[];
  showApplication?: boolean;
}) {
  const { onEdit, dialog } = useEditDialog();
  return (
    <>
      <ul className="-mx-2 flex flex-col">
        {tasks.map((t) => (
          <TaskRow key={t.id} task={t} onEdit={onEdit} showApplication={showApplication} />
        ))}
      </ul>
      {dialog}
    </>
  );
}

/** Tasks grouped into Overdue / Today / Upcoming / No date / Completed (collapsed). */
export function GroupedTaskList({ tasks }: { tasks: TaskDto[] }) {
  const { onEdit, dialog } = useEditDialog();
  const [showDone, setShowDone] = useState(false);

  return (
    <div className="flex flex-col gap-6">
      {SECTIONS.map(({ bucket, label }) => {
        const items = tasks.filter((t) => t.bucket === bucket);
        if (items.length === 0) return null;
        const collapsible = bucket === 'done';
        const open = !collapsible || showDone;
        return (
          <section key={bucket} aria-label={label}>
            <h2 className="mb-1 flex items-center gap-2 text-sm font-semibold">
              {collapsible ? (
                <button
                  type="button"
                  onClick={() => setShowDone((s) => !s)}
                  aria-expanded={open}
                  className="inline-flex cursor-pointer items-center gap-1 text-muted-foreground hover:text-foreground"
                >
                  {open ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
                  {label}
                </button>
              ) : (
                <span className={cn(bucket === 'overdue' && 'text-destructive')}>{label}</span>
              )}
              <span className="rounded-md bg-muted px-1.5 text-xs font-medium tabular-nums text-muted-foreground">
                {items.length}
              </span>
            </h2>
            {open && (
              <ul className="-mx-2 flex flex-col">
                {items.map((t) => (
                  <TaskRow key={t.id} task={t} onEdit={onEdit} />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      {dialog}
    </div>
  );
}
