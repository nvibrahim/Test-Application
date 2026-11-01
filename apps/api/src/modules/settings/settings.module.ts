import { Global, Module } from '@nestjs/common';
import { TwoFactorModule } from '../two-factor/two-factor.module';
import { SettingsReader } from './settings-reader';
import { SettingsController } from './settings.controller';
import { SettingsService } from './settings.service';

@Global()
@Module({
  imports: [TwoFactorModule],
  controllers: [SettingsController],
  providers: [SettingsReader, SettingsService],
  exports: [SettingsReader, SettingsService],
})
export class SettingsModule {}
