/**
 * Seeds the database from a job-tracker export (rows of a "Job Tracker" spreadsheet as JSON).
 * Safe to re-run: it wipes everything first.
 *
 * The file is personal data, so it is git-ignored and never committed: put yours at
 * prisma/data/job-tracker.json (or set LIFEOS_SEED_FILE). prisma/data/job-tracker.example.json
 * shows the format with fictional rows.
 *
 * Mapping from the sheet:
 * - Date Applied → appliedAt (a Berlin calendar day); Role → title; Location → location.
 * - Job URL → url when it is an http(s) link (normalized); anything else is kept in notes.
 * - Status Applied / Interview / Rejected → APPLIED / INTERVIEW / REJECTED.
 * - Follow-up Date → nextAction "Follow up" on that date.
 * - Next Action text, Track, Priority and Notes → notes, so nothing is lost.
 * - Timeline: CREATED + APPLICATION_SUBMITTED on the applied date. The sheet has no dates for
 *   rejections or interviews, so those events are dated to when the sheet was last saved and say so.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type ApplicationStatus, berlinWallTimeToUtc, formatDate } from '@lifeos/contracts';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../src/common/load-env';
import { normalizeUrl } from '../src/common/url';
import {
  type SeedApplication,
  type SeedCompany,
  type SeedDataset,
  type SeedEvent,
  companyKey,
  statusChange,
  writeDataset,
} from './seed-writer';

export interface TrackerRow {
  dateApplied: string;
  company: string;
  role: string | null;
  track: string | null;
  location: string | null;
  jobUrl: string | null;
  status: string;
  nextAction: string | null;
  followUpDate: string | null;
  priority: string | null;
  notes: string | null;
  sheetRow: number;
}

export interface TrackerFile {
  source: string;
  sourceLastSaved: string;
  rows: TrackerRow[];
}

const STATUS_MAP: Record<string, ApplicationStatus> = {
  saved: 'SAVED',
  applied: 'APPLIED',
  screening: 'SCREENING',
  interview: 'INTERVIEW',
  'final round': 'INTERVIEW',
  offer: 'OFFER',
  rejected: 'REJECTED',
  withdrawn: 'WITHDRAWN',
};

/** Template text left over in the sheet; not real notes. */
const PLACEHOLDER_NOTES = /^SAMPLE\b/i;

export const TRACKER_FILE = process.env.LIFEOS_SEED_FILE
  ? resolve(process.env.LIFEOS_SEED_FILE)
  : resolve(__dirname, 'data/job-tracker.json');

export function loadTrackerFile(path = TRACKER_FILE): TrackerFile {
  if (!existsSync(path)) {
    throw new Error(
      `No job tracker file at ${path}. Copy prisma/data/job-tracker.example.json to ` +
        'prisma/data/job-tracker.json and fill in your applications (it is git-ignored), ' +
        'or set LIFEOS_SEED_FILE.',
    );
  }
  return JSON.parse(readFileSync(path, 'utf8')) as TrackerFile;
}

/** Converts the tracker sheet rows into a seed dataset. Pure: no database access. */
export function trackerToDataset(file: TrackerFile): SeedDataset {
  const savedAt = berlinWallTimeToUtc(file.sourceLastSaved, '12:00');
  const savedLabel = formatDate(savedAt);
  const companies = new Map<string, SeedCompany>();
  const usedUrls = new Set<string>();

  const applications = file.rows.map((row): SeedApplication => {
    const status = STATUS_MAP[row.status.trim().toLowerCase()];
    if (!status) throw new Error(`Row ${row.sheetRow}: unknown status "${row.status}"`);

    const companyName = row.company.trim();
    if (!companies.has(companyKey(companyName))) {
      companies.set(companyKey(companyName), { name: companyName });
    }

    const notes: string[] = [];
    let url: string | undefined;
    if (row.jobUrl && /^https?:\/\//i.test(row.jobUrl)) {
      const normalized = normalizeUrl(row.jobUrl);
      if (usedUrls.has(normalized)) notes.push(`Job URL (also on another row): ${row.jobUrl}`);
      else {
        usedUrls.add(normalized);
        url = normalized;
      }
    } else if (row.jobUrl) {
      notes.push(`Job URL field: ${row.jobUrl}`);
    }
    if (row.nextAction) notes.push(`Note: ${row.nextAction}`);
    if (row.notes && !PLACEHOLDER_NOTES.test(row.notes)) notes.push(`Note: ${row.notes}`);
    if (row.track) notes.push(`Track: ${row.track}`);
    if (row.priority) notes.push(`Priority: ${row.priority}`);

    const appliedAt = berlinWallTimeToUtc(row.dateApplied);
    const unknownDate = `Recorded in the job tracker sheet (last saved ${savedLabel}); exact date not recorded.`;
    const later = savedAt > appliedAt ? savedAt : appliedAt;
    const events: SeedEvent[] = [
      {
        type: 'CREATED',
        at: appliedAt,
        title: 'Added to tracker',
        description: `Imported from the job tracker sheet, row ${row.sheetRow}.`,
      },
      { type: 'APPLICATION_SUBMITTED', at: appliedAt, title: 'Application submitted' },
    ];
    if (status === 'REJECTED') {
      events.push(statusChange('APPLIED', 'REJECTED', later, unknownDate));
      events.push({ type: 'REJECTION', at: later, title: 'Rejected', description: unknownDate });
    } else if (status === 'INTERVIEW') {
      events.push(statusChange('APPLIED', 'INTERVIEW', later, unknownDate));
    } else if (status !== 'APPLIED') {
      events.push(statusChange('APPLIED', status, later, unknownDate));
    }

    return {
      company: companyName,
      title: row.role?.trim() || 'Role not recorded',
      url,
      location: row.location?.trim() || undefined,
      status,
      appliedAt,
      nextAction: row.followUpDate ? 'Follow up' : undefined,
      nextActionDate: row.followUpDate ? berlinWallTimeToUtc(row.followUpDate) : undefined,
      notes: notes.length ? notes.join('\n') : undefined,
      events,
    };
  });

  return { companies: [...companies.values()], applications };
}

/** Clears the database and loads the job tracker data. */
export function seedDatabase(prisma: PrismaClient, file: TrackerFile = loadTrackerFile()) {
  return writeDataset(prisma, trackerToDataset(file));
}

if (require.main === module) {
  loadEnv();
  const prisma = new PrismaClient();
  seedDatabase(prisma)
    .then((r) =>
      console.log(
        `Seeded ${r.companies} companies, ${r.applications} applications and ${r.events} events from the job tracker.`,
      ),
    )
    .catch((err: unknown) => {
      console.error(err);
      process.exitCode = 1;
    })
    .finally(() => prisma.$disconnect());
}
