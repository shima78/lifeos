import { Module } from '@nestjs/common';
import { CompaniesModule } from '../companies/companies.module';
import { EventsModule } from '../events/events.module';
import { ApplicationsController } from './applications.controller';
import { ApplicationsRepository } from './applications.repository';
import { ApplicationsService } from './applications.service';

@Module({
  imports: [CompaniesModule, EventsModule],
  controllers: [ApplicationsController],
  providers: [ApplicationsService, ApplicationsRepository],
  exports: [ApplicationsService, ApplicationsRepository],
})
export class ApplicationsModule {}
