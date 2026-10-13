import {
  type ApplicationListQuery,
  type TaskListQuery,
  applicationListQuerySchema,
  taskListQuerySchema,
} from '@lifeos/contracts';
import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { ZodValidationPipe } from '../common/zod-validation.pipe';
import { type ExportFile, ExportService } from './export.service';

/** File downloads. Takes the same filters as the matching list endpoints. */
@Controller('export')
export class ExportController {
  constructor(private readonly exports: ExportService) {}

  @Get('applications.xlsx')
  async applications(
    @Query(new ZodValidationPipe(applicationListQuerySchema)) query: ApplicationListQuery,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.exports.applicationsFile(query));
  }

  @Get('tasks.xlsx')
  async tasks(
    @Query(new ZodValidationPipe(taskListQuerySchema)) query: TaskListQuery,
    @Res() res: Response,
  ): Promise<void> {
    send(res, await this.exports.tasksFile(query));
  }
}

function send(res: Response, file: ExportFile): void {
  res.setHeader('Content-Type', file.contentType);
  res.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  res.setHeader('Content-Length', String(file.data.length));
  res.send(file.data);
}
