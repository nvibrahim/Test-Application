import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Inject,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import type { ApiError, ErrorCode } from '@inspower/shared';
import { LOGGER } from '../logging/logging.module';
import type { Logger } from '../logging/logger';
import { ApiException } from './api-error';
import { requestIdOf } from './request-id.middleware';

const codeForStatus: Record<number, ErrorCode> = {
  400: 'validation_failed',
  401: 'unauthenticated',
  403: 'forbidden',
  404: 'not_found',
  409: 'conflict',
  429: 'rate_limited',
  503: 'temporarily_unavailable',
};

/** Every error leaves the API as `{ code, message, details?, requestId }`. */
@Catch()
export class ApiErrorFilter implements ExceptionFilter {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const res = ctx.getResponse<Response>();
    const req = ctx.getRequest<Request>();
    const requestId = requestIdOf(req);

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let body: ApiError = { code: 'internal_error', message: 'Something went wrong', requestId };

    if (exception instanceof ApiException) {
      status = exception.getStatus();
      body = { code: exception.code, message: exception.message, requestId };
      if (exception.details !== undefined) body.details = exception.details;
    } else if (exception instanceof HttpException) {
      status = exception.getStatus();
      const response = exception.getResponse();
      const message =
        typeof response === 'string'
          ? response
          : ((response as { message?: string | string[] }).message ?? exception.message);
      body = {
        code: codeForStatus[status] ?? 'internal_error',
        message: Array.isArray(message) ? message.join('; ') : String(message),
        requestId,
      };
    }

    if (status >= 500) {
      this.logger.error({ requestId, err: exception, path: req.path }, 'request failed');
    }
    res.status(status).json(body);
  }
}
