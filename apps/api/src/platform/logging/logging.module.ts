import { Global, Inject, Injectable, Module, type LoggerService } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/config';
import { createLogger, type Logger } from './logger';

export const LOGGER = Symbol('LOGGER');

/** Lets NestJS write its own lines through pino. */
@Injectable()
export class NestLogger implements LoggerService {
  constructor(@Inject(LOGGER) private readonly logger: Logger) {}
  log(message: unknown, context?: string) {
    this.logger.info({ context }, String(message));
  }
  error(message: unknown, trace?: string, context?: string) {
    this.logger.error({ context, trace }, String(message));
  }
  warn(message: unknown, context?: string) {
    this.logger.warn({ context }, String(message));
  }
  debug(message: unknown, context?: string) {
    this.logger.debug({ context }, String(message));
  }
  verbose(message: unknown, context?: string) {
    this.logger.trace({ context }, String(message));
  }
}

@Global()
@Module({
  providers: [
    {
      provide: LOGGER,
      inject: [ENV],
      useFactory: (env: Env) => createLogger(env.LOG_LEVEL, 'api'),
    },
    NestLogger,
  ],
  exports: [LOGGER, NestLogger],
})
export class LoggingModule {}
