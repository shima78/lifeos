import { z } from 'zod';
import type { ApplicationSummaryDto } from './dto';
import { dateInputSchema } from './schemas';

export const TASK_STATUSES = ['TODO', 'IN_PROGRESS', 'DONE'] as const;
export const taskStatusSchema = z.enum(TASK_STATUSES);
export type TaskStatus = z.infer<typeof taskStatusSchema>;

export const TASK_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;
export const taskPrioritySchema = z.enum(TASK_PRIORITIES);
export type TaskPriority = z.infer<typeof taskPrioritySchema>;

export const TASK_STATUS_LABELS: Record<TaskStatus, string> = {
  TODO: 'To do',
  IN_PROGRESS: 'In progress',
  DONE: 'Done',
};

export const TASK_PRIORITY_LABELS: Record<TaskPriority, string> = {
  LOW: 'Low',
  MEDIUM: 'Medium',
  HIGH: 'High',
};

/**
 * Where an open task falls by due date (Berlin calendar days). Done tasks are `done`.
 * The tasks page groups by this; the dashboard shows `overdue` and `today`.
 */
export const TASK_BUCKETS = ['overdue', 'today', 'upcoming', 'someday', 'done'] as const;
export type TaskBucket = (typeof TASK_BUCKETS)[number];

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const blankToNull = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? null : v);

export const createTaskSchema = z.object({
  title: z.string().trim().min(1, 'Title is required').max(300),
  notes: z.preprocess(blankToUndefined, z.string().trim().max(10000).optional()),
  status: taskStatusSchema.default('TODO'),
  priority: taskPrioritySchema.default('MEDIUM'),
  /** A calendar date (YYYY-MM-DD) or ISO datetime. */
  dueDate: z.preprocess(blankToUndefined, dateInputSchema.optional()),
  /** Link the task to a job application. */
  applicationId: z.preprocess(blankToUndefined, z.string().trim().min(1).max(100).optional()),
});
export type CreateTaskInput = z.input<typeof createTaskSchema>;
export type CreateTaskData = z.output<typeof createTaskSchema>;

/** Everything optional; `""`/null clears notes, dueDate and applicationId. */
export const updateTaskSchema = z
  .object({
    title: z.string().trim().min(1).max(300).optional(),
    notes: z.preprocess(blankToNull, z.string().trim().max(10000).nullable().optional()),
    status: taskStatusSchema.optional(),
    priority: taskPrioritySchema.optional(),
    dueDate: z.preprocess(blankToNull, dateInputSchema.nullable().optional()),
    applicationId: z.preprocess(
      blankToNull,
      z.string().trim().min(1).max(100).nullable().optional(),
    ),
  })
  .strict();
export type UpdateTaskInput = z.input<typeof updateTaskSchema>;
export type UpdateTaskData = z.output<typeof updateTaskSchema>;

const toArray = (v: unknown) => (v === undefined ? undefined : Array.isArray(v) ? v : [v]);

export const taskListQuerySchema = z.object({
  search: z.preprocess(blankToUndefined, z.string().trim().max(200).optional()),
  status: z.preprocess(toArray, z.array(taskStatusSchema).optional()),
  bucket: z.preprocess(toArray, z.array(z.enum(TASK_BUCKETS)).optional()),
  applicationId: z.preprocess(blankToUndefined, z.string().trim().max(100).optional()),
});
export type TaskListQueryInput = z.input<typeof taskListQuerySchema>;
export type TaskListQuery = z.output<typeof taskListQuerySchema>;

export interface TaskDto {
  id: string;
  title: string;
  notes: string | null;
  status: TaskStatus;
  priority: TaskPriority;
  dueDate: string | null;
  completedAt: string | null;
  /** Derived from status and dueDate relative to today (Berlin). */
  bucket: TaskBucket;
  application: ApplicationSummaryDto | null;
  createdAt: string;
  updatedAt: string;
}
