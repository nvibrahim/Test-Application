import { Module } from '@nestjs/common';
import { APP_GUARD } from '@nestjs/core';
import { AuthModule } from '../auth/auth.module';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { AccessGuard } from './access.guard';
import { AccessSync } from './access-sync';
import { FeaturesService } from './features.service';
import { MaintenanceService } from './maintenance.service';

@Module({
  imports: [AuthModule, TwoFactorModule],
  providers: [
    AccessSync,
    FeaturesService,
    MaintenanceService,
    { provide: APP_GUARD, useClass: AccessGuard },
  ],
  exports: [FeaturesService, MaintenanceService],
})
export class AccessModule {}
