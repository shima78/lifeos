'use client';

import { TASK_PRIORITIES, TASK_PRIORITY_LABELS, type TaskPriority } from '@lifeos/contracts';
import { LoaderCircle, Plus } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input, NativeSelect } from '@/components/ui/input';
import { useCreateTask } from '@/lib/queries';
import { cn } from '@/lib/utils';

/** One-line task entry: title, optional due date and priority. Enter adds it. */
export function QuickAddTask({
  applicationId,
  className,
}: {
  applicationId?: string;
  className?: string;
}) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('MEDIUM');
  const create = useCreateTask();

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return;
    create.mutate(
      { title, dueDate, priority, applicationId },
      {
        onSuccess: () => {
          setTitle('');
          setDueDate('');
          setPriority('MEDIUM');
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <form onSubmit={onSubmit} className={cn('flex flex-col gap-2 sm:flex-row', className)}>
      <Input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Add a task…"
        aria-label="New task"
        className="flex-1"
      />
      <div className="grid grid-cols-2 gap-2 sm:flex">
        <Input
          type="date"
          value={dueDate}
          onChange={(e) => setDueDate(e.target.value)}
          aria-label="Due date"
          className="col-span-2 sm:w-40"
        />
        <NativeSelect
          value={priority}
          onChange={(e) => setPriority(e.target.value as TaskPriority)}
          aria-label="Priority"
          className="w-full sm:w-28"
        >
          {TASK_PRIORITIES.map((p) => (
            <option key={p} value={p}>
              {TASK_PRIORITY_LABELS[p]}
            </option>
          ))}
        </NativeSelect>
        <Button
          type="submit"
          disabled={!title.trim() || create.isPending}
          className="w-full sm:w-auto"
        >
          {create.isPending ? <LoaderCircle className="animate-spin" /> : <Plus />}
          Add
        </Button>
      </div>
    </form>
  );
}
