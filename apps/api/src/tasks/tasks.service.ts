import {
  type CreateTaskData,
  TASK_BUCKETS,
  type TaskDto,
  type TaskListQuery,
  type TaskPriority,
  type UpdateTaskData,
} from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { NotFoundError } from '../common/errors';
import { toTaskDto } from './task.mapper';
import { TasksRepository, type TaskWriteData } from './tasks.repository';

const PRIORITY_RANK: Record<TaskPriority, number> = { HIGH: 0, MEDIUM: 1, LOW: 2 };
const bucketRank = (b: TaskDto['bucket']) => TASK_BUCKETS.indexOf(b);

/**
 * Order for display: by bucket (overdue → today → upcoming → someday → done); within open
 * buckets by due date, then priority (high first); done tasks most recently completed first.
 */
export function compareTasks(a: TaskDto, b: TaskDto): number {
  const byBucket = bucketRank(a.bucket) - bucketRank(b.bucket);
  if (byBucket !== 0) return byBucket;
  if (a.bucket === 'done') return (b.completedAt ?? '').localeCompare(a.completedAt ?? '');
  const byDue = (a.dueDate ?? '').localeCompare(b.dueDate ?? '');
  if (byDue !== 0) return byDue;
  const byPriority = PRIORITY_RANK[a.priority] - PRIORITY_RANK[b.priority];
  if (byPriority !== 0) return byPriority;
  return a.createdAt.localeCompare(b.createdAt);
}

@Injectable()
export class TasksService {
  constructor(
    private readonly tasks: TasksRepository,
    private readonly clock: Clock,
  ) {}

  async list(query: Partial<TaskListQuery> = {}): Promise<TaskDto[]> {
    const now = this.clock.now();
    const rows = await this.tasks.findMany({
      statuses: query.status,
      applicationId: query.applicationId,
      search: query.search,
    });
    const dtos = rows.map((t) => toTaskDto(t, now));
    const buckets = query.bucket?.length ? new Set(query.bucket) : null;
    return (buckets ? dtos.filter((t) => buckets.has(t.bucket)) : dtos).sort(compareTasks);
  }

  async get(id: string): Promise<TaskDto> {
    return toTaskDto(await this.findOrThrow(id), this.clock.now());
  }

  async create(data: CreateTaskData): Promise<TaskDto> {
    if (data.applicationId) await this.assertApplication(data.applicationId);
    const now = this.clock.now();
    const created = await this.tasks.create({
      title: data.title,
      notes: data.notes ?? null,
      status: data.status,
      priority: data.priority,
      dueDate: data.dueDate ?? null,
      applicationId: data.applicationId ?? null,
      completedAt: data.status === 'DONE' ? now : null,
    });
    return toTaskDto(created, now);
  }

  /** Moving to DONE stamps completedAt; reopening clears it. */
  async update(id: string, data: UpdateTaskData): Promise<TaskDto> {
    const current = await this.findOrThrow(id);
    if (data.applicationId) await this.assertApplication(data.applicationId);
    const now = this.clock.now();
    const changes: TaskWriteData = { ...data };
    if (data.status && data.status !== current.status) {
      changes.completedAt = data.status === 'DONE' ? now : null;
    }
    return toTaskDto(await this.tasks.update(id, changes), now);
  }

  async delete(id: string): Promise<void> {
    await this.findOrThrow(id);
    await this.tasks.delete(id);
  }

  private async findOrThrow(id: string) {
    const task = await this.tasks.findById(id);
    if (!task) throw NotFoundError.entity('Task', id);
    return task;
  }

  private async assertApplication(id: string): Promise<void> {
    if (!(await this.tasks.applicationExists(id))) throw NotFoundError.entity('Application', id);
  }
}
