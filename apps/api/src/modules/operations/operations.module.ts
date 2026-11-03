import { Module } from '@nestjs/common';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { AuditLogService } from './audit-log.service';
import { FeaturesAdminService } from './features-admin.service';
import { JobsService } from './jobs.service';
import { AuditLogController, FeaturesController, JobsController } from './operations.controller';

@Module({
  imports: [TwoFactorModule],
  controllers: [JobsController, AuditLogController, FeaturesController],
  providers: [JobsService, AuditLogService, FeaturesAdminService],
})
export class OperationsModule {}
