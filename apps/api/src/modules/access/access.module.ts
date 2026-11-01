import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { AccessGuard } from './access.guard';
import { AccessSync } from './access-sync';

@Module({
  imports: [AuthModule],
  providers: [AccessSync, { provide: APP_GUARD, useClass: AccessGuard }],
})
export class AccessModule {}
