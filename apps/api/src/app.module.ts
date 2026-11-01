import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, DiscoveryModule } from '@nestjs/core';
import { ConfigModule } from './platform/config/config.module';
import { DatabaseModule } from './platform/database/database.module';
import { HealthModule } from './platform/health/health.module';
import { ApiErrorFilter } from './platform/http/api-error.filter';
import { requestId } from './platform/http/request-id.middleware';
import { LoggingModule } from './platform/logging/logging.module';
import { MailModule } from './platform/mail/mail.module';
import { RedisModule } from './platform/redis/redis.module';
import { TransactionModule } from './platform/transaction/transaction.module';

@Module({
  imports: [
    DiscoveryModule,
    ConfigModule,
    LoggingModule,
    DatabaseModule,
    RedisModule,
    MailModule,
    TransactionModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestId).forRoutes('*path');
  }
}
