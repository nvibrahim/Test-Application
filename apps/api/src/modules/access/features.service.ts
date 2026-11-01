import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../platform/database/prisma.service';
import type { AuthContext } from './request-context';

/**
 * Feature switches: off / on / super_admin_only / selected_users. A switch with no row is off.
 * Routes and pages behind a switch answer "not found" while it is off. The screen that manages
 * the rows arrives with Phase 7; the check is here so modules can use it from day one.
 */
@Injectable()
export class FeaturesService {
  constructor(private readonly prisma: PrismaService) {}

  async isAvailable(key: string, auth: AuthContext): Promise<boolean> {
    const flag = await this.prisma.featureFlag.findUnique({
      where: { key },
      include: { users: { where: { userId: auth.userId }, select: { userId: true } } },
    });
    if (!flag || flag.organizationId !== auth.organizationId) return false;
    switch (flag.state) {
      case 'on':
        return true;
      case 'super_admin_only':
        return auth.isSuperAdmin;
      case 'selected_users':
        return auth.isSuperAdmin || flag.users.length > 0;
      default:
        return false;
    }
  }

  async anyAvailable(keys: string[], auth: AuthContext): Promise<boolean> {
    for (const key of keys) if (await this.isAvailable(key, auth)) return true;
    return false;
  }
}
