import { Module } from '@nestjs/common';
import { ApplicationsModule } from './applications/applications.module';
import { AssistantModule } from './assistant/assistant.module';
import { CommonModule } from './common/common.module';
import { CompaniesModule } from './companies/companies.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { EventsModule } from './events/events.module';
import { HealthController } from './health/health.controller';
import { PrismaModule } from './prisma/prisma.module';
import { TasksModule } from './tasks/tasks.module';

/**
 * Root module. HTTP (main.ts), the MCP server (mcp.ts) and the smoke script all boot this same
 * module graph.
 */
@Module({
  imports: [
    CommonModule,
    PrismaModule,
    CompaniesModule,
    EventsModule,
    ApplicationsModule,
    DashboardModule,
    AssistantModule,
    TasksModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
