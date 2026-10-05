import { Test, type TestingModule } from '@nestjs/testing';
import { AppModule } from '../app.module';
import { Clock } from '../common/clock';
import { PrismaService } from '../prisma/prisma.service';

/** A clock tests can set and advance. */
export class FixedClock extends Clock {
  constructor(private current: Date = new Date('2026-10-04T10:00:00.000Z')) {
    super();
  }

  now(): Date {
    return new Date(this.current);
  }

  set(date: Date | string): void {
    this.current = new Date(date);
  }
}

export interface TestContext {
  module: TestingModule;
  prisma: PrismaService;
  clock: FixedClock;
}

/** Boots the real AppModule (against the test database) with a controllable clock. */
export async function createTestContext(): Promise<TestContext> {
  const clock = new FixedClock();
  const module = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(Clock)
    .useValue(clock)
    .compile();
  await module.init();
  return { module, prisma: module.get(PrismaService), clock };
}

export async function resetDatabase(prisma: PrismaService): Promise<void> {
  await prisma.client.$executeRawUnsafe(
    'TRUNCATE TABLE "ApplicationEvent", "Application", "Company" RESTART IDENTITY CASCADE',
  );
}
