import { type MiddlewareConsumer, Module, type NestModule } from '@nestjs/common';
import { APP_FILTER, DiscoveryModule } from '@nestjs/core';
import { AccessModule } from './modules/access/access.module';
import { AuthModule } from './modules/auth/auth.module';
import { OrganizationModule } from './modules/organization/organization.module';
import { SettingsModule } from './modules/settings/settings.module';
import { ConfigModule } from './platform/config/config.module';
import { DatabaseModule } from './platform/database/database.module';
import { HealthModule } from './platform/health/health.module';
import { ApiErrorFilter } from './platform/http/api-error.filter';
import { requestId } from './platform/http/request-id.middleware';
import { JobsModule } from './platform/jobs/jobs.module';
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
    JobsModule,
    TransactionModule,
    SettingsModule,
    OrganizationModule,
    AuthModule,
    AccessModule,
    HealthModule,
  ],
  providers: [{ provide: APP_FILTER, useClass: ApiErrorFilter }],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(requestId).forRoutes('*path');
  }
}
