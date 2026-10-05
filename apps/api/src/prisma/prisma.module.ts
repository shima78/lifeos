import { Global, Module } from '@nestjs/common';
import { DatabaseHealthRepository } from './database-health.repository';
import { PrismaService } from './prisma.service';
import { TransactionRunner } from './transaction-runner';

@Global()
@Module({
  providers: [PrismaService, TransactionRunner, DatabaseHealthRepository],
  exports: [PrismaService, TransactionRunner, DatabaseHealthRepository],
})
export class PrismaModule {}
