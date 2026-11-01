import { Inject, Injectable, type OnModuleInit } from '@nestjs/common';
import {
  builtInRoles,
  permissionRegistry,
  permissionRenames,
  SUPER_ADMIN_ROLE_KEY,
} from '@inspower/shared';
import { PrismaService, type Tx } from '../../platform/database/prisma.service';
import { LOGGER } from '../../platform/logging/logging.module';
import type { Logger } from '../../platform/logging/logger';

/** Writes the permission registry to the database and makes sure the built-in roles exist. */
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
  await syncPermissionRegistry(tx);
  const organizations = await tx.organization.findMany({ select: { id: true } });
  for (const org of organizations) await ensureBuiltInRoles(tx, org.id);
}

/** The registry rows, renames applied; safe to run from the CLI before the API has ever started. */
export async function syncPermissionRegistry(tx: Tx): Promise<void> {
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
  // A permission that left the registry disappears from every role.
  await tx.rolePermission.deleteMany({
    where: { permissionKey: { notIn: permissionRegistry.map((p) => p.key) } },
  });
  await tx.permission.deleteMany({
    where: { key: { notIn: permissionRegistry.map((p) => p.key) } },
  });
  const organizations = await tx.organization.findMany({ select: { id: true } });
  for (const org of organizations) await ensureBuiltInRoles(tx, org.id);
}

/** Built-in roles exist for every organization; a built-in role's default permissions are written only when it is first created. */
export async function ensureBuiltInRoles(tx: Tx, organizationId: string): Promise<void> {
  // The CLI may run this before the API ever started; the permission rows must exist first.
  if ((await tx.permission.count()) < permissionRegistry.length) await syncPermissionRegistry(tx);
  for (const def of builtInRoles) {
    const existing = await tx.role.findUnique({
      where: { organizationId_key: { organizationId, key: def.key } },
    });
    if (existing) {
      if (!existing.isSystem)
        await tx.role.update({ where: { id: existing.id }, data: { isSystem: true } });
      continue;
    }
    const role = await tx.role.create({
      data: {
        organizationId,
        key: def.key,
        name: def.name,
        description: def.description,
        isSystem: true,
      },
    });
    if (def.permissions !== '*') {
      await tx.rolePermission.createMany({
        data: def.permissions.map((permissionKey) => ({
          roleId: role.id,
          permissionKey,
          organizationId,
        })),
        skipDuplicates: true,
      });
    }
  }
}

export async function ensureSuperAdminRole(tx: Tx, organizationId: string): Promise<string> {
  await ensureBuiltInRoles(tx, organizationId);
  const role = await tx.role.findUniqueOrThrow({
    where: { organizationId_key: { organizationId, key: SUPER_ADMIN_ROLE_KEY } },
  });
  return role.id;
}
