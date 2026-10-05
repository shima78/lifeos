'use client';

import {
  type ApplicationEventDto,
  EVENT_TYPE_LABELS,
  MANUAL_EVENT_TYPES,
  type ManualEventType,
  berlinWallTimeToUtc,
  createEventSchema,
  voidEventSchema,
} from '@lifeos/contracts';
import { LoaderCircle } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { toast } from 'sonner';
import { Field } from '@/components/field';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input, NativeSelect, Textarea } from '@/components/ui/input';
import { formatDate, toBerlinDateString, toBerlinTimeString } from '@/lib/format';
import { useAddEvent, useVoidEvent } from '@/lib/queries';

/** Combines a date input and an optional time input (Berlin) into an ISO string. */
const toIso = (date: string, time: string): string | undefined =>
  date ? berlinWallTimeToUtc(date, time || '00:00').toISOString() : undefined;

export function AddEventDialog({
  applicationId,
  open,
  onOpenChange,
}: {
  applicationId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const now = new Date();
  const [type, setType] = useState<ManualEventType>('NOTE');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(toBerlinDateString(now));
  const [time, setTime] = useState(toBerlinTimeString(now));
  const [scheduledDate, setScheduledDate] = useState('');
  const [scheduledTime, setScheduledTime] = useState('10:00');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const add = useAddEvent(applicationId);

  const reset = () => {
    const n = new Date();
    setType('NOTE');
    setTitle('');
    setDescription('');
    setDate(toBerlinDateString(n));
    setTime(toBerlinTimeString(n));
    setScheduledDate('');
    setScheduledTime('10:00');
    setErrors({});
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    const input = {
      type,
      title,
      description,
      occurredAt: toIso(date, time),
      scheduledFor: toIso(scheduledDate, scheduledTime),
    };
    const parsed = createEventSchema.safeParse(input);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [i.path.join('.'), i.message])));
      return;
    }
    add.mutate(input, {
      onSuccess: () => {
        toast.success(`${EVENT_TYPE_LABELS[type]} added`);
        reset();
        onOpenChange(false);
      },
      onError: (err) => toast.error(err.message),
    });
  };

  const needsSchedule = type === 'INTERVIEW_SCHEDULED';

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : (reset(), onOpenChange(o)))}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add event</DialogTitle>
          <DialogDescription>Record something that happened in this process.</DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field id="event-type" label="Type">
            <NativeSelect
              id="event-type"
              value={type}
              onChange={(e) => setType(e.target.value as ManualEventType)}
            >
              {MANUAL_EVENT_TYPES.map((t) => (
                <option key={t} value={t}>
                  {EVENT_TYPE_LABELS[t]}
                </option>
              ))}
            </NativeSelect>
          </Field>

          {needsSchedule && (
            <Field id="scheduled-date" label="Interview date" error={errors.scheduledFor}>
              <div className="flex gap-2">
                <Input
                  id="scheduled-date"
                  type="date"
                  value={scheduledDate}
                  aria-invalid={errors.scheduledFor ? true : undefined}
                  onChange={(e) => setScheduledDate(e.target.value)}
                />
                <Input
                  type="time"
                  value={scheduledTime}
                  aria-label="Interview time"
                  className="w-32"
                  onChange={(e) => setScheduledTime(e.target.value)}
                />
              </div>
            </Field>
          )}

          <Field
            id="event-title"
            label="Title"
            hint={`Optional. Defaults to “${EVENT_TYPE_LABELS[type]}”.`}
          >
            <Input id="event-title" value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>

          <Field id="event-description" label="Description">
            <Textarea
              id="event-description"
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </Field>

          <Field id="event-date" label="When did it happen?" error={errors.occurredAt}>
            <div className="flex gap-2">
              <Input
                id="event-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
              />
              <Input
                type="time"
                value={time}
                aria-label="Time"
                className="w-32"
                onChange={(e) => setTime(e.target.value)}
              />
            </div>
          </Field>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={add.isPending}>
              {add.isPending && <LoaderCircle className="animate-spin" />}
              Add event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function VoidEventDialog({
  applicationId,
  event,
  onClose,
}: {
  applicationId: string;
  event: ApplicationEventDto | null;
  onClose: () => void;
}) {
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string>();
  const voidEvent = useVoidEvent(applicationId);

  const close = () => {
    setReason('');
    setError(undefined);
    onClose();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (!event) return;
    const parsed = voidEventSchema.safeParse({ reason });
    if (!parsed.success) return setError(parsed.error.issues[0]?.message);
    voidEvent.mutate(
      { eventId: event.id, reason },
      {
        onSuccess: () => {
          toast.success('Event voided', {
            description: 'It stays in the timeline, struck through.',
          });
          close();
        },
        onError: (err) => toast.error(err.message),
      },
    );
  };

  return (
    <Dialog open={event !== null} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Void this event?</DialogTitle>
          <DialogDescription>
            Events are never deleted. Voiding keeps “{event?.title}”
            {event ? ` (${formatDate(event.occurredAt)})` : ''} in the timeline, struck through, and
            stops it counting as activity.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <Field id="void-reason" label="Reason" error={error}>
            <Input
              id="void-reason"
              value={reason}
              autoFocus
              placeholder="e.g. Logged on the wrong application"
              aria-invalid={error ? true : undefined}
              onChange={(e) => {
                setReason(e.target.value);
                setError(undefined);
              }}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={close}>
              Cancel
            </Button>
            <Button type="submit" variant="destructive" disabled={voidEvent.isPending}>
              {voidEvent.isPending && <LoaderCircle className="animate-spin" />}
              Void event
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
