/**
 * Replaces ALL data with the contents of a backup made by `pnpm db:backup`.
 * Usage: pnpm db:restore <backup-file>
 * Runs in one transaction: if anything fails, the database is left unchanged.
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { type Prisma, PrismaClient } from '@prisma/client';
import { loadEnv } from '../src/common/load-env';

interface Backup {
  format: string;
  companies: Prisma.CompanyCreateManyInput[];
  applications: Prisma.ApplicationCreateManyInput[];
  events: Prisma.ApplicationEventCreateManyInput[];
}

async function main(): Promise<void> {
  loadEnv();
  const file = process.argv[2];
  if (!file || !existsSync(resolve(file))) {
    throw new Error('Usage: pnpm db:restore <backup-file>  (file not found)');
  }
  const backup = JSON.parse(readFileSync(resolve(file), 'utf8')) as Backup;
  if (backup.format !== 'lifeos-backup/1')
    throw new Error(`Unknown backup format: ${backup.format}`);

  const prisma = new PrismaClient();
  try {
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(
        'TRUNCATE TABLE "ApplicationEvent", "Application", "Company" RESTART IDENTITY CASCADE',
      );
      await tx.company.createMany({ data: backup.companies });
      await tx.application.createMany({ data: backup.applications });
      // Events are inserted as-is (voided ones included); the append-only trigger only guards
      // updates and deletes.
      await tx.applicationEvent.createMany({
        data: backup.events.map((e) => ({ ...e, metadata: e.metadata ?? undefined })),
      });
      // Continue the insertion-order counter after the restored events.
      await tx.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('"ApplicationEvent"', 'sequence'), COALESCE((SELECT MAX("sequence") FROM "ApplicationEvent"), 0) + 1, false)`,
      );
    });
    console.log(
      `Restored ${backup.companies.length} companies, ${backup.applications.length} applications and ${backup.events.length} events.`,
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error('Restore failed:', err instanceof Error ? err.message : err);
  process.exit(1);
});
