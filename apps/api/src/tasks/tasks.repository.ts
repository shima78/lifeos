import type { TaskPriority, TaskStatus } from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { TaskWithApplication } from './task.mapper';

const includeApplication = {
  application: { include: { company: { select: { id: true, name: true } } } },
} as const;

export interface TaskFilter {
  statuses?: TaskStatus[];
  applicationId?: string;
  search?: string;
}

export interface TaskWriteData {
  title?: string;
  notes?: string | null;
  status?: TaskStatus;
  priority?: TaskPriority;
  dueDate?: Date | null;
  completedAt?: Date | null;
  applicationId?: string | null;
}

@Injectable()
export class TasksRepository {
  constructor(private readonly prisma: PrismaService) {}

  findMany(filter: TaskFilter = {}): Promise<TaskWithApplication[]> {
    const where: Prisma.TaskWhereInput = {};
    if (filter.statuses?.length) where.status = { in: filter.statuses };
    if (filter.applicationId) where.applicationId = filter.applicationId;
    if (filter.search) {
      where.OR = [
        { title: { contains: filter.search, mode: 'insensitive' } },
        { notes: { contains: filter.search, mode: 'insensitive' } },
      ];
    }
    return this.prisma.db.task.findMany({
      where,
      include: includeApplication,
      orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'asc' }],
    });
  }

  findById(id: string): Promise<TaskWithApplication | null> {
    return this.prisma.db.task.findUnique({ where: { id }, include: includeApplication });
  }

  create(data: TaskWriteData & { title: string }): Promise<TaskWithApplication> {
    return this.prisma.db.task.create({ data, include: includeApplication });
  }

  update(id: string, data: TaskWriteData): Promise<TaskWithApplication> {
    return this.prisma.db.task.update({ where: { id }, data, include: includeApplication });
  }

  async delete(id: string): Promise<void> {
    await this.prisma.db.task.delete({ where: { id } });
  }

  async applicationExists(id: string): Promise<boolean> {
    const found = await this.prisma.db.application.findUnique({
      where: { id },
      select: { id: true },
    });
    return found !== null;
  }
}
