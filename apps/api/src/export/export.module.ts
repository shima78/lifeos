import { Module } from '@nestjs/common';
import { ApplicationsModule } from '../applications/applications.module';
import { EventsModule } from '../events/events.module';
import { TasksModule } from '../tasks/tasks.module';
import { ExportController } from './export.controller';
import { ExportService } from './export.service';

@Module({
  imports: [ApplicationsModule, EventsModule, TasksModule],
  controllers: [ExportController],
  providers: [ExportService],
})
export class ExportModule {}
