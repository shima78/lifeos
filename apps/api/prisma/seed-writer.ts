/**
 * Writes a complete dataset (companies, applications, events) after wiping the database.
 * Uses Prisma directly (outside the Nest app) so historical timestamps can be set precisely;
 * callers are responsible for producing data that follows the rules the services enforce.
 */
import {
  type ApplicationStatus,
  type EventType,
  EVENT_TYPE_LABELS,
  STATUS_LABELS,
} from '@lifeos/contracts';
import type { Prisma, PrismaClient } from '@prisma/client';

export interface SeedEvent {
  type: EventType;
  at: Date;
  title?: string;
  description?: string;
  scheduledFor?: Date;
  metadata?: Prisma.InputJsonValue;
  voided?: { at: Date; reason: string };
}

export interface SeedCompany {
  name: string;
  website?: string;
  location?: string;
  notes?: string;
}

export interface SeedApplication {
  /** Company name; matched case-insensitively against `companies`. */
  company: string;
  title: string;
  url?: string;
  location?: string;
  employmentType?: string;
  description?: string;
  status: ApplicationStatus;
  appliedAt?: Date;
  nextAction?: string;
  nextActionDate?: Date;
  recruiterName?: string;
  recruiterEmail?: string;
  notes?: string;
  events: SeedEvent[];
}

export interface SeedDataset {
  companies: SeedCompany[];
  applications: SeedApplication[];
}

export const companyKey = (name: string): string => name.trim().toLowerCase();

export const statusChange = (
  from: ApplicationStatus,
  to: ApplicationStatus,
  at: Date,
  description?: string,
): SeedEvent => ({
  type: 'STATUS_CHANGED',
  at,
  title: `Status changed: ${STATUS_LABELS[from]} → ${STATUS_LABELS[to]}`,
  description,
  metadata: { from, to },
});

/** Truncates all tables, then inserts the dataset. Returns what was written. */
export async function writeDataset(
  prisma: PrismaClient,
  { companies, applications }: SeedDataset,
): Promise<{ companies: number; applications: number; events: number }> {
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "ApplicationEvent", "Application", "Company" RESTART IDENTITY CASCADE',
  );

  const companyIds = new Map<string, string>();
  for (const c of companies) {
    const created = await prisma.company.create({
      data: { ...c, name: c.name.trim(), nameKey: companyKey(c.name) },
    });
    companyIds.set(companyKey(c.name), created.id);
  }

  let events = 0;
  for (const { company, events: appEvents, ...app } of applications) {
    const companyId = companyIds.get(companyKey(company));
    if (!companyId) throw new Error(`Seed data references unknown company "${company}"`);
    const lastActivityAt = appEvents
      .filter((e) => !e.voided)
      .reduce<Date | null>((max, e) => (!max || e.at > max ? e.at : max), null);
    await prisma.application.create({
      data: {
        ...app,
        companyId,
        lastActivityAt,
        createdAt: appEvents[0]?.at ?? new Date(),
        events: {
          create: appEvents.map((e) => ({
            type: e.type,
            title: e.title ?? EVENT_TYPE_LABELS[e.type],
            description: e.description,
            occurredAt: e.at,
            scheduledFor: e.scheduledFor,
            metadata: e.metadata,
            voidedAt: e.voided?.at,
            voidReason: e.voided?.reason,
            createdAt: e.at,
          })),
        },
      },
    });
    events += appEvents.length;
  }

  return { companies: companies.length, applications: applications.length, events };
}
