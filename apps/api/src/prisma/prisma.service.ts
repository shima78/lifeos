import { AsyncLocalStorage } from 'node:async_hooks';
import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { type Prisma, PrismaClient } from '@prisma/client';

export type Db = Prisma.TransactionClient;

/**
 * Owns the Prisma client plus an AsyncLocalStorage-scoped transaction. Repositories read `db`,
 * which is the active transaction when called inside TransactionRunner.run(), so services can
 * make several repository calls atomic without ever seeing Prisma.
 *
 * Composition rather than `extends PrismaClient`: the client is a Proxy, and `this` inside a
 * subclass getter would be the bare target without model delegates.
 */
@Injectable()
export class PrismaService implements OnModuleInit, OnModuleDestroy {
  readonly client = new PrismaClient();
  private readonly txStorage = new AsyncLocalStorage<Db>();

  get db(): Db {
    return this.txStorage.getStore() ?? this.client;
  }

  async runInTransaction<T>(fn: () => Promise<T>): Promise<T> {
    if (this.txStorage.getStore()) return fn();
    return this.client.$transaction((tx) => this.txStorage.run(tx, fn));
  }

  /**
   * Waits up to ~30s for the database, because `pnpm dev` starts Postgres alongside the API.
   */
  async onModuleInit(): Promise<void> {
    const attempts = 30;
    for (let i = 1; ; i++) {
      try {
        await this.client.$connect();
        return;
      } catch (err) {
        if (i >= attempts) throw err;
        if (i === 1) console.error('Waiting for the database to start…');
        await new Promise((r) => setTimeout(r, 1000));
      }
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.client.$disconnect();
  }
}
