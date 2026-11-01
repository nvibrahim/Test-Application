import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import { permissionRegistry, permissionRenames, SUPER_ADMIN_ROLE_KEY } from '@inspower/shared';
import { PrismaService, type Tx } from '../../platform/database/prisma.service';
import { LOGGER } from '../../platform/logging/logging.module';
import type { Logger } from '../../platform/logging/logger';

/** Writes the permission registry to the database and makes sure the Super Admin role exists. */
@Injectable()
export class AccessSync implements OnModuleInit {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(LOGGER) private readonly logger: Logger,
  ) {}

  async onModuleInit(): Promise<void> {
    await this.prisma.$transaction((tx) => syncAccessControl(tx));
    this.logger.info({ permissions: permissionRegistry.length }, 'access control synced');
  }
}

export async function syncAccessControl(tx: Tx): Promise<void> {
  for (const rename of permissionRenames) {
    await tx.rolePermission.updateMany({
      where: { permissionKey: rename.from },
      data: { permissionKey: rename.to },
    });
    await tx.permission.deleteMany({ where: { key: rename.from } });
  }
  for (const p of permissionRegistry) {
    await tx.permission.upsert({
      where: { key: p.key },
      update: {
        module: p.module,
        label: p.label,
        description: p.description,
        superAdminOnly: p.superAdminOnly ?? false,
      },
      create: {
        key: p.key,
        module: p.module,
        label: p.label,
        description: p.description,
        superAdminOnly: p.superAdminOnly ?? false,
      },
    });
  }
  const organizations = await tx.organization.findMany({ select: { id: true } });
  for (const org of organizations) await ensureSuperAdminRole(tx, org.id);
}

export async function ensureSuperAdminRole(tx: Tx, organizationId: string): Promise<string> {
  const role = await tx.role.upsert({
    where: { organizationId_key: { organizationId, key: SUPER_ADMIN_ROLE_KEY } },
    update: { isSystem: true },
    create: {
      organizationId,
      key: SUPER_ADMIN_ROLE_KEY,
      name: 'Super Admin',
      description: 'Every permission, now and in the future. Cannot be edited.',
      isSystem: true,
    },
  });
  return role.id;
}
