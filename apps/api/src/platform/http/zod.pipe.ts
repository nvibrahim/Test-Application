import { type PipeTransform } from '@nestjs/common';
import type { ZodType } from 'zod';
import { validationFailed } from './api-error';

/** Validates a request part with a Zod schema; refusals use the `validation_failed` code. */
export class ZodPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}
  transform(value: unknown): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      throw validationFailed(
        result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
    }
    return result.data;
  }
}
