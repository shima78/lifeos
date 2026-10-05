import {
  type ApplicationDto,
  type ApplicationListQuery,
  type ApplicationStatus,
  type ApplicationWarningDto,
  type ChangeStatusData,
  type CreateApplicationData,
  type CreateApplicationResultDto,
  STATUS_LABELS,
  SUBMITTED_STATUSES,
  type UpdateApplicationData,
} from '@lifeos/contracts';
import { Injectable } from '@nestjs/common';
import { Clock } from '../common/clock';
import { startOfNextBerlinDay } from '../common/dates';
import { ConflictError, NotFoundError } from '../common/errors';
import { normalizeUrl } from '../common/url';
import { CompaniesService } from '../companies/companies.service';
import type { NewEvent } from '../events/events.repository';
import { EventsService } from '../events/events.service';
import { TransactionRunner } from '../prisma/transaction-runner';
import { toApplicationDto } from './application.mapper';
import { ApplicationsRepository, type ApplicationWriteData } from './applications.repository';

/** Semantic events implied by moving into a status (besides STATUS_CHANGED). */
const SEMANTIC_EVENT_FOR_STATUS: Partial<
  Record<ApplicationStatus, Pick<NewEvent, 'type' | 'title'>>
> = {
  REJECTED: { type: 'REJECTION', title: 'Rejected' },
  OFFER: { type: 'OFFER', title: 'Offer received' },
  WITHDRAWN: { type: 'WITHDRAWN', title: 'Application withdrawn' },
};

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly applications: ApplicationsRepository,
    private readonly companies: CompaniesService,
    private readonly events: EventsService,
    private readonly tx: TransactionRunner,
    private readonly clock: Clock,
  ) {}

  async list(query: Partial<ApplicationListQuery> = {}): Promise<ApplicationDto[]> {
    const rows = await this.applications.findMany(
      {
        search: query.search,
        statuses: query.status,
        companyId: query.companyId,
        location: query.location,
        appliedFrom: query.appliedFrom,
        // The "to" date is inclusive of that whole Berlin calendar day.
        appliedBefore: query.appliedTo ? startOfNextBerlinDay(query.appliedTo) : undefined,
      },
      query.sort ?? 'lastActivityAt',
      query.order ?? 'desc',
    );
    return rows.map(toApplicationDto);
  }

  async get(id: string): Promise<ApplicationDto> {
    return toApplicationDto(await this.findOrThrow(id));
  }

  /**
   * Creates an application, its company (if new) and its initial events in one transaction.
   * A URL that is already tracked returns the existing application with `duplicate: true`.
   */
  async create(data: CreateApplicationData): Promise<CreateApplicationResultDto> {
    const url = data.url ? normalizeUrl(data.url) : null;

    return this.tx.run(async () => {
      if (url) {
        const existing = await this.applications.findByUrl(url);
        if (existing) {
          return { application: toApplicationDto(existing), duplicate: true, warnings: [] };
        }
      }

      const now = this.clock.now();
      const companyId = await this.companies.findOrCreateByName(data.companyName);

      const warnings: ApplicationWarningDto[] = [];
      if (!url) {
        const similar = await this.applications.findSimilar(companyId, data.title, data.location);
        for (const match of similar) {
          warnings.push({
            code: 'POSSIBLE_DUPLICATE',
            message: `You may already track "${match.title}" at ${match.company.name}`,
            applicationId: match.id,
          });
        }
      }

      const submitted = SUBMITTED_STATUSES.includes(data.status);
      const appliedAt = data.appliedAt ?? (submitted ? now : null);

      const created = await this.applications.create({
        companyId,
        title: data.title,
        url,
        location: data.location ?? null,
        employmentType: data.employmentType ?? null,
        description: data.description ?? null,
        status: data.status,
        appliedAt,
        nextAction: data.nextAction ?? null,
        nextActionDate: data.nextActionDate ?? null,
        recruiterName: data.recruiterName ?? null,
        recruiterEmail: data.recruiterEmail ?? null,
        notes: data.notes ?? null,
      });

      const events: NewEvent[] = [
        {
          type: 'CREATED',
          title: 'Added to LifeOS',
          occurredAt: now,
          metadata: { status: data.status },
        },
      ];
      if (submitted && appliedAt) {
        events.push({
          type: 'APPLICATION_SUBMITTED',
          title: 'Application submitted',
          occurredAt: appliedAt,
        });
      }
      await this.events.record(created.id, events);

      return { application: await this.get(created.id), duplicate: false, warnings };
    });
  }

  /** Updates everything except status (see changeStatus). */
  async update(id: string, data: UpdateApplicationData): Promise<ApplicationDto> {
    return this.tx.run(async () => {
      await this.findOrThrow(id);
      const { companyName, url, ...fields } = data;
      const changes: ApplicationWriteData = { ...fields };

      if (companyName !== undefined) {
        changes.companyId = await this.companies.findOrCreateByName(companyName);
      }
      if (url !== undefined) {
        changes.url = url === null ? null : normalizeUrl(url);
        if (changes.url) {
          const other = await this.applications.findByUrl(changes.url);
          if (other && other.id !== id) {
            throw new ConflictError('Another application already uses this URL', {
              applicationId: other.id,
            });
          }
        }
      }

      return toApplicationDto(await this.applications.update(id, changes));
    });
  }

  /**
   * Changes status and records STATUS_CHANGED plus any implied semantic event, atomically.
   * Any transition is allowed. Setting the current status again is a no-op.
   */
  async changeStatus(id: string, data: ChangeStatusData): Promise<ApplicationDto> {
    return this.tx.run(async () => {
      const app = await this.findOrThrow(id);
      const from = app.status;
      const to = data.status;
      if (from === to) return toApplicationDto(app);

      const occurredAt = data.occurredAt ?? this.clock.now();
      const changes: ApplicationWriteData = { status: to };
      const events: NewEvent[] = [
        {
          type: 'STATUS_CHANGED',
          title: `Status changed: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`,
          description: data.note ?? null,
          occurredAt,
          metadata: { from, to },
        },
      ];

      if (from === 'SAVED' && to === 'APPLIED') {
        events.push({ type: 'APPLICATION_SUBMITTED', title: 'Application submitted', occurredAt });
        if (!app.appliedAt) changes.appliedAt = occurredAt;
      }
      const semantic = SEMANTIC_EVENT_FOR_STATUS[to];
      if (semantic) events.push({ ...semantic, occurredAt });

      await this.applications.update(id, changes);
      await this.events.record(id, events);
      return this.get(id);
    });
  }

  private async findOrThrow(id: string) {
    const app = await this.applications.findById(id);
    if (!app) throw NotFoundError.entity('Application', id);
    return app;
  }
}
