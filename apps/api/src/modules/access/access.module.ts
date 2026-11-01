import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { AccessGuard } from './access.guard';
import { AccessSync } from './access-sync';
import { FeaturesService } from './features.service';

@Module({
  imports: [AuthModule, TwoFactorModule],
  providers: [AccessSync, FeaturesService, { provide: APP_GUARD, useClass: AccessGuard }],
  exports: [FeaturesService],
})
export class AccessModule {}
