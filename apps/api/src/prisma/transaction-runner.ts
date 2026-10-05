import { Injectable } from '@nestjs/common';
import { PrismaService } from './prisma.service';

/** Runs a unit of work atomically. All repository calls inside `fn` share one transaction. */
@Injectable()
export class TransactionRunner {
  constructor(private readonly prisma: PrismaService) {}

  run<T>(fn: () => Promise<T>): Promise<T> {
    return this.prisma.runInTransaction(fn);
  }
}
