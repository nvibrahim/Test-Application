import { Injectable } from '@nestjs/common';
import { maintenanceSettingsSchema } from '@inspower/shared';
import { PrismaService } from '../../platform/database/prisma.service';
import { SettingsReader } from '../settings/settings-reader';
import type { AuthContext } from './request-context';

/** Maintenance mode closes the app to everyone except the roles chosen in Settings -> Maintenance. */
@Injectable()
export class MaintenanceService {
  constructor(
    private readonly settings: SettingsReader,
    private readonly prisma: PrismaService,
  ) {}

  async mayUse(auth: AuthContext): Promise<boolean> {
    const m = await this.settings.read(
      auth.organizationId,
      'maintenance',
      maintenanceSettingsSchema,
    );
    if (!m.enabled) return true;
    if (auth.isSuperAdmin) return true;
    const roles = await this.prisma.userRole.findMany({
      where: { userId: auth.userId },
      select: { role: { select: { key: true } } },
    });
    return roles.some((r) => m.allowedRoleKeys.includes(r.role.key));
  }

  async message(organizationId: string): Promise<string> {
    const m = await this.settings.read(organizationId, 'maintenance', maintenanceSettingsSchema);
    return m.message;
  }
}
