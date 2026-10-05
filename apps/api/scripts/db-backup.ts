/**
 * Exports all LifeOS data (companies, applications, events) to a JSON file.
 * Usage: pnpm db:backup [output-file]
 * Default location: ~/.lifeos/backups/lifeos-<timestamp>.json (override with LIFEOS_HOME).
 * The format is independent of the Postgres version, so it moves data between any setups.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';
import { loadEnv } from '../src/common/load-env';

/** v2 adds tasks; restore still accepts v1 files. */
export const BACKUP_FORMAT = 'lifeos-backup/2';

async function main(): Promise<void> {
  loadEnv();
  const home = process.env.LIFEOS_HOME || resolve(homedir(), '.lifeos');
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const out = resolve(process.argv[2] ?? resolve(home, 'backups', `lifeos-${stamp}.json`));

  const prisma = new PrismaClient();
  try {
    const [companies, applications, events, tasks] = await Promise.all([
      prisma.company.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.application.findMany({ orderBy: { createdAt: 'asc' } }),
      prisma.applicationEvent.findMany({ orderBy: { sequence: 'asc' } }),
      prisma.task.findMany({ orderBy: { createdAt: 'asc' } }),
    ]);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(
      out,
      JSON.stringify(
        {
          format: BACKUP_FORMAT,
          createdAt: new Date().toISOString(),
          companies,
          applications,
          events,
          tasks,
        },
        null,
        2,
      ),
    );
    console.log(
      `Backed up ${companies.length} companies, ${applications.length} applications, ${events.length} events and ${tasks.length} tasks to\n  ${out}`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Backup failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
