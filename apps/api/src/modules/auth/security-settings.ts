import { Injectable, type OnModuleInit } from '@nestjs/common';
import {
  SETTINGS_SECTION_SECURITY,
  securitySettingsSchema,
  type SecuritySettings,
} from '@inspower/shared';
import { SettingsReader } from '../settings/settings-reader';
import { SessionsService } from './sessions.service';

/** One place to read Settings -> Security; also wires the loader the sessions service needs. */
@Injectable()
export class SecuritySettingsService implements OnModuleInit {
  constructor(
    private readonly settings: SettingsReader,
    private readonly sessions: SessionsService,
  ) {}

  onModuleInit(): void {
    this.sessions.securitySettingsLoader = (organizationId) => this.read(organizationId);
  }

  read(organizationId: string): Promise<SecuritySettings> {
    return this.settings.read(organizationId, SETTINGS_SECTION_SECURITY, securitySettingsSchema);
  }
}
