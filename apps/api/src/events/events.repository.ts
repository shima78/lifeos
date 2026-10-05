import type { EventType } from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import { type ApplicationEvent, Prisma } from '@prisma/client';
import type { ApplicationWithCompany } from '../applications/application.mapper';
import { PrismaService } from '../prisma/prisma.service';

export interface NewEvent {
  type: EventType;
  title: string;
  description?: string | null;
  occurredAt: Date;
  scheduledFor?: Date | null;
  metadata?: Record<string, unknown> | null;
}

export type EventWithApplication = ApplicationEvent & { application: ApplicationWithCompany };

const includeApplication = {
  application: { include: { company: { select: { id: true, name: true } } } },
} as const;

/**
 * Append-only access to ApplicationEvent. There is deliberately no update or delete method:
 * the only mutation is `markVoided`, and a database trigger rejects anything else.
 */
@Injectable()
export class EventsRepository {
  constructor(private readonly prisma: PrismaService) {}

  async applicationExists(applicationId: string): Promise<boolean> {
    const found = await this.prisma.db.application.findUnique({
      where: { id: applicationId },
      select: { id: true },
    });
    return found !== null;
  }

  async createMany(applicationId: string, events: NewEvent[]): Promise<ApplicationEvent[]> {
    const created: ApplicationEvent[] = [];
    for (const e of events) {
      created.push(
        await this.prisma.db.applicationEvent.create({
          data: {
            applicationId,
            type: e.type,
            title: e.title,
            description: e.description ?? null,
            occurredAt: e.occurredAt,
            scheduledFor: e.scheduledFor ?? null,
            metadata: (e.metadata ?? undefined) as Prisma.InputJsonValue | undefined,
          },
        }),
      );
    }
    return created;
  }

  findById(id: string): Promise<ApplicationEvent | null> {
    return this.prisma.db.applicationEvent.findUnique({ where: { id } });
  }

  /** Newest first. Includes voided events. */
  findByApplication(applicationId: string): Promise<ApplicationEvent[]> {
    return this.prisma.db.applicationEvent.findMany({
      where: { applicationId },
      orderBy: [{ occurredAt: 'desc' }, { sequence: 'desc' }],
    });
  }

  markVoided(id: string, voidedAt: Date, reason: string): Promise<ApplicationEvent> {
    return this.prisma.db.applicationEvent.update({
      where: { id },
      data: { voidedAt, voidReason: reason },
    });
  }

  /** Recomputes Application.lastActivityAt from its non-voided events. */
  async refreshLastActivity(applicationId: string): Promise<void> {
    const latest = await this.prisma.db.applicationEvent.aggregate({
      where: { applicationId, voidedAt: null },
      _max: { occurredAt: true },
    });
    await this.prisma.db.application.update({
      where: { id: applicationId },
      data: { lastActivityAt: latest._max.occurredAt },
    });
  }

  findRecent(limit: number): Promise<EventWithApplication[]> {
    return this.prisma.db.applicationEvent.findMany({
      where: { voidedAt: null },
      include: includeApplication,
      orderBy: [{ occurredAt: 'desc' }, { sequence: 'desc' }],
      take: limit,
    });
  }

  /** Non-voided INTERVIEW_SCHEDULED events with scheduledFor >= from (and <= to, if given). */
  findScheduledInterviews(from: Date, to?: Date): Promise<EventWithApplication[]> {
    return this.prisma.db.applicationEvent.findMany({
      where: {
        type: 'INTERVIEW_SCHEDULED',
        voidedAt: null,
        scheduledFor: { gte: from, ...(to && { lte: to }) },
      },
      include: includeApplication,
      orderBy: { scheduledFor: 'asc' },
    });
  }
}
