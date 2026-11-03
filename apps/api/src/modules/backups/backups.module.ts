import { Global, Module } from '@nestjs/common';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { BackupsController } from './backups.controller';
import { BackupsService } from './backups.service';

@Global()
@Module({
  imports: [TwoFactorModule],
  controllers: [BackupsController],
  providers: [BackupsService],
  exports: [BackupsService],
})
export class BackupsModule {}
