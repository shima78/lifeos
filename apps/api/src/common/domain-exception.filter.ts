import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { ApiErrorBody, ErrorCode } from '@lifeos/contracts';
import type { Response } from 'express';
import { DomainError } from './errors';

const STATUS_BY_CODE: Record<ErrorCode, number> = {
  NOT_FOUND: HttpStatus.NOT_FOUND,
  VALIDATION_ERROR: HttpStatus.BAD_REQUEST,
  CONFLICT: HttpStatus.CONFLICT,
  INTERNAL_ERROR: HttpStatus.INTERNAL_SERVER_ERROR,
};

const CODE_BY_HTTP_STATUS: Partial<Record<number, ErrorCode>> = {
  [HttpStatus.BAD_REQUEST]: 'VALIDATION_ERROR',
  [HttpStatus.NOT_FOUND]: 'NOT_FOUND',
  [HttpStatus.CONFLICT]: 'CONFLICT',
};

/** Maps every error to the standard `{ error: { code, message, details? } }` shape. */
@Catch()
export class DomainExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();
    const { status, body } = this.toResponse(exception);
    if (status >= 500) {
      this.logger.error(exception instanceof Error ? exception.stack : String(exception));
    }
    res.status(status).json(body);
  }

  private toResponse(exception: unknown): { status: number; body: ApiErrorBody } {
    if (exception instanceof DomainError) {
      const error: ApiErrorBody['error'] = { code: exception.code, message: exception.message };
      if (exception.details !== undefined) error.details = exception.details;
      return { status: STATUS_BY_CODE[exception.code], body: { error } };
    }
    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const code =
        CODE_BY_HTTP_STATUS[status] ?? (status >= 500 ? 'INTERNAL_ERROR' : 'VALIDATION_ERROR');
      return { status, body: { error: { code, message: exception.message } } };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      body: { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } },
    };
  }
}
