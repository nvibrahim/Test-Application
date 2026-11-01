import { HttpException } from '@nestjs/common';
import { httpStatusFor, type ErrorCode } from '@inspower/shared';

/** The one exception type the API throws on purpose; the filter turns it into the error contract. */
export class ApiException extends HttpException {
  constructor(
    public readonly code: ErrorCode,
    message: string,
    public readonly details?: unknown,
  ) {
    super({ code, message, details }, httpStatusFor[code]);
  }
}

export const notFound = (message = 'Not found') => new ApiException('not_found', message);
export const forbidden = (message = 'Forbidden') => new ApiException('forbidden', message);
export const unauthenticated = (message = 'Sign in first') =>
  new ApiException('unauthenticated', message);
export const conflict = (message: string) => new ApiException('conflict', message);
export const validationFailed = (details: unknown) =>
  new ApiException('validation_failed', 'The request is not valid', details);
export const temporarilyUnavailable = (message = 'Temporarily unavailable') =>
  new ApiException('temporarily_unavailable', message);
