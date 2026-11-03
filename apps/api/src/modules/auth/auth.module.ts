import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { CredentialsService } from './credentials.service';
import { CsrfService } from './csrf.service';
import { PasswordsService } from './passwords.service';
import { ProfileController } from './profile.controller';
import { ProfileService } from './profile.service';
import { RecoveryService } from './recovery.service';
import { SecuritySettingsService } from './security-settings';
import { SessionsService } from './sessions.service';
import { SetupController } from './setup.controller';
import { SetupService } from './setup.service';
import { ThrottleService } from './throttle.service';

@Module({
  controllers: [AuthController, ProfileController, SetupController],
  providers: [
    PasswordsService,
    ThrottleService,
    CsrfService,
    SessionsService,
    SecuritySettingsService,
    CredentialsService,
    RecoveryService,
    SetupService,
    ProfileService,
  ],
  exports: [SessionsService, CsrfService, PasswordsService, SecuritySettingsService],
})
export class AuthModule {}
