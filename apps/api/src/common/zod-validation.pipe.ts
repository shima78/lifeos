import { Injectable, type PipeTransform } from '@nestjs/common';
import type { ZodTypeAny, output } from 'zod';
import { ValidationError } from './errors';

/** Parses a request part with a shared Zod schema from @lifeos/contracts. */
@Injectable()
export class ZodValidationPipe<T extends ZodTypeAny> implements PipeTransform<unknown, output<T>> {
  constructor(private readonly schema: T) {}

  transform(value: unknown): output<T> {
    const result = this.schema.safeParse(value ?? {});
    if (!result.success) {
      throw new ValidationError(
        'Invalid request',
        result.error.issues.map((issue) => ({
          path: issue.path.join('.'),
          message: issue.message,
        })),
      );
    }
    return result.data as output<T>;
  }
}
