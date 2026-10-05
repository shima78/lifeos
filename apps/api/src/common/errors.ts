import type { ErrorCode } from '@lifeos/contracts';

/**
 * Transport-independent domain errors. Services throw these; the HTTP layer maps them to
 * status codes in DomainExceptionFilter, and a future MCP layer can map them to tool errors.
 */
export abstract class DomainError extends Error {
  abstract readonly code: ErrorCode;

  constructor(
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class NotFoundError extends DomainError {
  readonly code = 'NOT_FOUND' as const;

  static entity(entity: string, id: string): NotFoundError {
    return new NotFoundError(`${entity} ${id} not found`, { entity, id });
  }
}

export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_ERROR' as const;
}

export class ConflictError extends DomainError {
  readonly code = 'CONFLICT' as const;
}
