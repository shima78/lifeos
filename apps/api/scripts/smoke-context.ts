/**
 * Proves the services run without HTTP: boots the Nest application context (exactly what the
 * future MCP stdio entry point will do), calls ApplicationsService.list(), prints the count.
 */
import 'reflect-metadata';
import { loadEnv } from '../src/common/load-env';

loadEnv();

import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { ApplicationsService } from '../src/applications/applications.service';

async function main(): Promise<void> {
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn'] });
  try {
    const applications = await app.get(ApplicationsService).list();
    console.log(`Smoke OK: ${applications.length} applications (no HTTP server started)`);
  } finally {
    await app.close();
  }
}

main().catch((err: unknown) => {
  console.error('Smoke FAILED:', err);
  process.exit(1);
});
