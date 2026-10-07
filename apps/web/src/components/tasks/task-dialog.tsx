'use client';

import {
  TASK_PRIORITIES,
  TASK_PRIORITY_LABELS,
  TASK_STATUSES,
  TASK_STATUS_LABELS,
  type TaskDto,
  type TaskPriority,
  type TaskStatus,
  createTaskSchema,
  toBerlinDateString,
} from '@lifeos/contracts';
import { LoaderCircle } from 'lucide-react';
import { type FormEvent, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { useApplications, useCreateTask, useUpdateTask } from '@/lib/queries';

interface Values {
  title: string;
  notes: string;
  dueDate: string;
  priority: TaskPriority;
  status: TaskStatus;
  applicationId: string;
}

const fromTask = (task?: TaskDto | null, applicationId?: string): Values => ({
  title: task?.title ?? '',
  notes: task?.notes ?? '',
  dueDate: task?.dueDate ? toBerlinDateString(task.dueDate) : '',
  priority: task?.priority ?? 'MEDIUM',
  status: task?.status ?? 'TODO',
  applicationId: task?.application?.id ?? applicationId ?? '',
});

/** Create (no `task`) or edit a task. */
export function TaskDialog({
  open,
  onOpenChange,
  task,
  defaultApplicationId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  task?: TaskDto | null;
  defaultApplicationId?: string;
}) {
  const [values, setValues] = useState<Values>(() => fromTask(task, defaultApplicationId));
  const [error, setError] = useState<string>();
  const create = useCreateTask();
  const update = useUpdateTask();
  const applications = useApplications({ sort: 'company', order: 'asc' });
  const pending = create.isPending || update.isPending;

  useEffect(() => {
    if (open) {
      setValues(fromTask(task, defaultApplicationId));
      setError(undefined);
    }
  }, [open, task, defaultApplicationId]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) =>
    setValues((v) => ({ ...v, [key]: value }));

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const parsed = createTaskSchema.safeParse(values);
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    const done = {
      onSuccess: () => onOpenChange(false),
      onError: (err: Error) => toast.error(err.message),
    };
    if (task) update.mutate({ id: task.id, ...values }, done);
    else
      create.mutate(values, {
        ...done,
        onSuccess: () => (toast.success('Task added'), onOpenChange(false)),
      });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{task ? 'Edit task' : 'New task'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field id="task-title" label="Title" error={error}>
            <Input
              id="task-title"
              value={values.title}
              autoFocus
              onChange={(e) => (set('title', e.target.value), setError(undefined))}
              aria-invalid={error ? true : undefined}
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field id="task-due" label="Due date">
              <Input
                id="task-due"
                type="date"
                value={values.dueDate}
                onChange={(e) => set('dueDate', e.target.value)}
              />
            </Field>
            <Field id="task-priority" label="Priority">
              <NativeSelect
                id="task-priority"
                value={values.priority}
                onChange={(e) => set('priority', e.target.value as TaskPriority)}
              >
                {TASK_PRIORITIES.map((p) => (
                  <option key={p} value={p}>
                    {TASK_PRIORITY_LABELS[p]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
            {task && (
              <Field id="task-status" label="Status">
                <NativeSelect
                  id="task-status"
                  value={values.status}
                  onChange={(e) => set('status', e.target.value as TaskStatus)}
                >
                  {TASK_STATUSES.map((s) => (
                    <option key={s} value={s}>
                      {TASK_STATUS_LABELS[s]}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
            )}
            <Field
              id="task-application"
              label="Application"
              className={task ? '' : 'sm:col-span-2'}
            >
              <NativeSelect
                id="task-application"
                value={values.applicationId}
                onChange={(e) => set('applicationId', e.target.value)}
              >
                <option value="">None</option>
                {applications.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.company.name} · {a.title}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field id="task-notes" label="Notes">
            <Textarea
              id="task-notes"
              rows={3}
              value={values.notes}
              onChange={(e) => set('notes', e.target.value)}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending && <LoaderCircle className="animate-spin" />}
              {task ? 'Save' : 'Add task'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
