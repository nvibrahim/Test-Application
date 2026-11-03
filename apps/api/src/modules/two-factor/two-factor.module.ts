import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { StepUpService } from './step-up.service';
import { TwoFactorAuthController, TwoFactorController } from './two-factor.controller';
import { TwoFactorService } from './two-factor.service';

@Module({
  imports: [AuthModule],
  controllers: [TwoFactorController, TwoFactorAuthController],
  providers: [TwoFactorService, StepUpService],
  exports: [TwoFactorService, StepUpService],
})
export class TwoFactorModule {}
