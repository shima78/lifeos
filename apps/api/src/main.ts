import 'reflect-metadata';
import { loadEnv } from './common/load-env';

loadEnv();

import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { configureHttpApp } from './app.setup';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  configureHttpApp(app);
  const port = Number(process.env.API_PORT ?? 3001);
  await app.listen(port);
  Logger.log(`LifeOS API listening on http://localhost:${port}`, 'Bootstrap');
}

void bootstrap();
