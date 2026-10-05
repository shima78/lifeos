import { type TaskBucket, type TaskDto, calendarDaysBetween } from '@lifeos/contracts';
import type { Task } from '@prisma/client';
import {
  type ApplicationWithCompany,
  toApplicationSummaryDto,
} from '../applications/application.mapper';
import { toIso } from '../common/dates';

export type TaskWithApplication = Task & { application: ApplicationWithCompany | null };

/** Where a task falls relative to today (Berlin calendar days). */
export function taskBucket(task: Pick<Task, 'status' | 'dueDate'>, now: Date): TaskBucket {
  if (task.status === 'DONE') return 'done';
  if (!task.dueDate) return 'someday';
  const days = calendarDaysBetween(now, task.dueDate);
  return days < 0 ? 'overdue' : days === 0 ? 'today' : 'upcoming';
}

export function toTaskDto(task: TaskWithApplication, now: Date): TaskDto {
  return {
    id: task.id,
    title: task.title,
    notes: task.notes,
    status: task.status,
    priority: task.priority,
    dueDate: toIso(task.dueDate),
    completedAt: toIso(task.completedAt),
    bucket: taskBucket(task, now),
    application: task.application ? toApplicationSummaryDto(task.application) : null,
    createdAt: task.createdAt.toISOString(),
    updatedAt: task.updatedAt.toISOString(),
  };
}
