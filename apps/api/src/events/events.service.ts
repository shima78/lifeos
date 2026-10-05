import {
  type ApplicationEventDto,
  type CreateEventData,
  EVENT_TYPE_LABELS,
  type VoidEventData,
} from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { ConflictError, NotFoundError, ValidationError } from '../common/errors';
import { TransactionRunner } from '../prisma/transaction-runner';
import { toEventDto } from './event.mapper';
import { EventsRepository, type NewEvent } from './events.repository';

/**
 * Owns the append-only event log. Events can be recorded and voided; there is intentionally
 * no way to edit or delete one.
 */
@Injectable()
export class EventsService {
  constructor(
    private readonly events: EventsRepository,
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  /** All events of an application, newest first, including voided ones. */
  async timeline(applicationId: string): Promise<ApplicationEventDto[]> {
    await this.assertApplicationExists(applicationId);
    const rows = await this.events.findByApplication(applicationId);
    return rows.map(toEventDto);
  }

  /** Adds a user-entered event. */
  async add(applicationId: string, data: CreateEventData): Promise<ApplicationEventDto> {
    if (data.type === 'INTERVIEW_SCHEDULED' && !data.scheduledFor) {
      throw new ValidationError('A scheduled interview needs a date (scheduledFor)', {
        path: 'scheduledFor',
      });
    }
    return this.tx.run(async () => {
      await this.assertApplicationExists(applicationId);
      const [event] = await this.record(applicationId, [
        {
          type: data.type,
          title: data.title ?? EVENT_TYPE_LABELS[data.type],
          description: data.description ?? null,
          occurredAt: data.occurredAt ?? this.clock.now(),
          scheduledFor: data.scheduledFor ?? null,
        },
      ]);
      return toEventDto(event!);
    });
  }

  /** Marks an event as voided. The row stays; it is shown struck-through. */
  async void(
    applicationId: string,
    eventId: string,
    data: VoidEventData,
  ): Promise<ApplicationEventDto> {
    return this.tx.run(async () => {
      const event = await this.events.findById(eventId);
      if (!event || event.applicationId !== applicationId) {
        throw NotFoundError.entity('Event', eventId);
      }
      if (event.voidedAt) throw new ConflictError('This event is already voided');
      const voided = await this.events.markVoided(eventId, this.clock.now(), data.reason);
      await this.events.refreshLastActivity(applicationId);
      return toEventDto(voided);
    });
  }

  /**
   * Appends system or user events and refreshes the application's last activity.
   * Callers that also change the application wrap this in the same transaction.
   */
  async record(applicationId: string, events: NewEvent[]) {
    return this.tx.run(async () => {
      const created = await this.events.createMany(applicationId, events);
      await this.events.refreshLastActivity(applicationId);
      return created;
    });
  }

  private async assertApplicationExists(applicationId: string): Promise<void> {
    if (!(await this.events.applicationExists(applicationId))) {
      throw NotFoundError.entity('Application', applicationId);
    }
  }
}
