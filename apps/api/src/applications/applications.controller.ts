import {
  type ApplicationDto,
  type ApplicationEventDto,
  type ApplicationListQuery,
  type ChangeStatusData,
  type CreateApplicationData,
  type CreateApplicationResultDto,
  type CreateEventData,
  type UpdateApplicationData,
  type VoidEventData,
  applicationListQuerySchema,
  changeStatusSchema,
  createApplicationSchema,
  createEventSchema,
  updateApplicationSchema,
  voidEventSchema,
} from '@lifeos/contracts';
import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { EventsService } from '../events/events.service';
import { ApplicationsService } from './applications.service';

@Controller('applications')
export class ApplicationsController {
  constructor(
    private readonly applications: ApplicationsService,
    private readonly events: EventsService,
  ) {}

  @Get()
  list(
    @Query(new ZodValidationPipe(applicationListQuerySchema)) query: ApplicationListQuery,
  ): Promise<ApplicationDto[]> {
    return this.applications.list(query);
  }

  /** 201 when created, 200 when the URL was already tracked (`duplicate: true`). */
  @Post()
  async create(
    @Body(new ZodValidationPipe(createApplicationSchema)) body: CreateApplicationData,
    @Res({ passthrough: true }) res: Response,
  ): Promise<CreateApplicationResultDto> {
    const result = await this.applications.create(body);
    res.status(result.duplicate ? HttpStatus.OK : HttpStatus.CREATED);
    return result;
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ApplicationDto> {
    return this.applications.get(id);
  }

  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(updateApplicationSchema)) body: UpdateApplicationData,
  ): Promise<ApplicationDto> {
    return this.applications.update(id, body);
  }

  @Post(':id/status')
  @HttpCode(HttpStatus.OK)
  changeStatus(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(changeStatusSchema)) body: ChangeStatusData,
  ): Promise<ApplicationDto> {
    return this.applications.changeStatus(id, body);
  }

  @Get(':id/timeline')
  timeline(@Param('id') id: string): Promise<ApplicationEventDto[]> {
    return this.events.timeline(id);
  }

  @Post(':id/events')
  addEvent(
    @Param('id') id: string,
    @Body(new ZodValidationPipe(createEventSchema)) body: CreateEventData,
  ): Promise<ApplicationEventDto> {
    return this.events.add(id, body);
  }

  @Post(':id/events/:eventId/void')
  @HttpCode(HttpStatus.OK)
  voidEvent(
    @Param('id') id: string,
    @Param('eventId') eventId: string,
    @Body(new ZodValidationPipe(voidEventSchema)) body: VoidEventData,
  ): Promise<ApplicationEventDto> {
    return this.events.void(id, eventId, body);
  }
}
