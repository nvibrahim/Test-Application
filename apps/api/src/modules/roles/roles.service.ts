import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  builtInRoles,
  permissionModuleLabels,
  permissionRegistry,
  reservedPermissionKeys,
  SUPER_ADMIN_ROLE_KEY,
  type Role,
  type RolesResponse,
} from '@inspower/shared';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException, conflict, forbidden, notFound } from '../../platform/http/api-error';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';

export const RoleActions = {
  created: 'roles.role.created',
  updated: 'roles.role.updated',
  reset: 'roles.role.reset',
  deleted: 'roles.role.deleted',
} as const;

@Injectable()
export class RolesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
  ) {}

  private toRole(row: {
    id: string;
    key: string;
    name: string;
    description: string | null;
    isSystem: boolean;
    isCustomised: boolean;
    version: number;
    permissions: { permissionKey: string }[];
    _count: { userRoles: number };
  }): Role {
    const fixed = row.key === SUPER_ADMIN_ROLE_KEY;
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      isFixed: fixed,
      isCustomised: row.isCustomised,
      permissions: fixed
        ? permissionRegistry.map((p) => p.key)
        : row.permissions.map((p) => p.permissionKey).sort(),
      memberCount: row._count.userRoles,
      version: row.version,
    };
  }

  private readonly include = {
    permissions: { select: { permissionKey: true } },
    _count: { select: { userRoles: true } },
  } as const;

  async list(auth: AuthContext): Promise<RolesResponse> {
    const rows = await this.prisma.role.findMany({
      where: { organizationId: auth.organizationId },
      include: this.include,
      orderBy: [{ isSystem: 'desc' }, { name: 'asc' }],
    });
    const order = builtInRoles.map((r) => r.key);
    rows.sort((a, b) => {
      const ai = order.indexOf(a.key);
      const bi = order.indexOf(b.key);
      if (ai !== -1 || bi !== -1) return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      return a.name.localeCompare(b.name);
    });
    const modules = [...new Set(permissionRegistry.map((p) => p.module))].map((key) => ({
      key,
      label: permissionModuleLabels[key] ?? key,
    }));
    return {
      roles: rows.map((r) => this.toRole(r)),
      permissions: permissionRegistry.map((p) => ({
        key: p.key,
        module: p.module,
        label: p.label,
        description: p.description,
        superAdminOnly: p.superAdminOnly ?? false,
      })),
      modules,
    };
  }

  async get(auth: AuthContext, id: string): Promise<Role> {
    const row = await this.prisma.role.findFirst({
      where: { id, organizationId: auth.organizationId },
      include: this.include,
    });
    if (!row) throw notFound('Role not found');
    return this.toRole(row);
  }

  private checkPermissions(keys: string[]): string[] {
    const unique = [...new Set(keys)];
    const unknown = unique.filter((k) => !permissionRegistry.some((p) => p.key === k));
    if (unknown.length)
      throw new ApiException('validation_failed', `Unknown permission: ${unknown.join(', ')}`);
    const reserved = unique.filter((k) => reservedPermissionKeys.includes(k));
    if (reserved.length)
      throw new ApiException(
        'reserved_permission',
        `Reserved to the Super Admin: ${reserved.join(', ')}`,
      );
    return unique;
  }

  async create(
    req: Request,
    auth: AuthContext,
    input: { name: string; description?: string; permissions: string[]; copyFromRoleId?: string },
  ): Promise<Role> {
    let permissions = input.permissions;
    if (input.copyFromRoleId) {
      const source = await this.get(auth, input.copyFromRoleId);
      if (source.isFixed) throw forbidden('The Super Admin role cannot be copied');
      permissions = [...source.permissions, ...permissions];
    }
    permissions = this.checkPermissions(permissions);
    const key = await this.uniqueKey(auth.organizationId, input.name);
    let id = '';
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      const role = await tx.role.create({
        data: {
          organizationId: auth.organizationId,
          key,
          name: input.name,
          description: input.description || null,
          isSystem: false,
          createdBy: auth.userId,
          updatedBy: auth.userId,
        },
      });
      id = role.id;
      if (permissions.length) {
        await tx.rolePermission.createMany({
          data: permissions.map((permissionKey) => ({
            roleId: role.id,
            permissionKey,
            organizationId: auth.organizationId,
          })),
        });
      }
      await audit({
        action: RoleActions.created,
        entityType: 'role',
        entityId: role.id,
        changes: { after: { name: input.name, permissions } },
      });
      await emit({ name: 'roles.role.created', channels: ['admin'], payload: { id: role.id } });
    });
    return this.get(auth, id);
  }

  private async uniqueKey(organizationId: string, name: string): Promise<string> {
    const base =
      name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40) || 'role';
    let key = base;
    for (
      let i = 2;
      await this.prisma.role.findUnique({ where: { organizationId_key: { organizationId, key } } });
      i += 1
    )
      key = `${base}_${i}`;
    return key;
  }

  async update(
    req: Request,
    auth: AuthContext,
    id: string,
    input: { name?: string; description?: string | null; permissions?: string[]; version: number },
  ): Promise<Role> {
    const before = await this.get(auth, id);
    if (before.isFixed) throw forbidden('The Super Admin role cannot be edited');
    if (before.version !== input.version)
      throw conflict('Someone else saved this role first. Reload and try again.');
    const permissions =
      input.permissions !== undefined ? this.checkPermissions(input.permissions) : undefined;
    const def = builtInRoles.find((r) => r.key === before.key);
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.role.update({
        where: { id },
        data: {
          ...(input.name !== undefined && !before.isSystem ? { name: input.name } : {}),
          ...(input.description !== undefined ? { description: input.description } : {}),
          ...(permissions !== undefined && def
            ? { isCustomised: !sameSet(permissions, def.permissions as string[]) }
            : {}),
          version: { increment: 1 },
          updatedBy: auth.userId,
        },
      });
      if (permissions !== undefined) {
        await tx.rolePermission.deleteMany({ where: { roleId: id } });
        if (permissions.length)
          await tx.rolePermission.createMany({
            data: permissions.map((permissionKey) => ({
              roleId: id,
              permissionKey,
              organizationId: auth.organizationId,
            })),
          });
      }
      await audit({
        action: RoleActions.updated,
        entityType: 'role',
        entityId: id,
        changes: {
          before: { name: before.name, permissions: before.permissions },
          after: {
            name: input.name ?? before.name,
            permissions: permissions ?? before.permissions,
          },
        },
      });
      await emit({ name: 'roles.role.updated', channels: ['admin'], payload: { id } });
    });
    return this.get(auth, id);
  }

  async resetToDefault(req: Request, auth: AuthContext, id: string): Promise<Role> {
    const before = await this.get(auth, id);
    const def = builtInRoles.find((r) => r.key === before.key);
    if (!def || def.permissions === '*')
      throw forbidden('Only the built-in Administrator, Member and Viewer roles have a default');
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.rolePermission.deleteMany({ where: { roleId: id } });
      await tx.rolePermission.createMany({
        data: (def.permissions as string[]).map((permissionKey) => ({
          roleId: id,
          permissionKey,
          organizationId: auth.organizationId,
        })),
      });
      await tx.role.update({
        where: { id },
        data: {
          isCustomised: false,
          name: def.name,
          description: def.description,
          version: { increment: 1 },
          updatedBy: auth.userId,
        },
      });
      await audit({
        action: RoleActions.reset,
        entityType: 'role',
        entityId: id,
        changes: {
          before: { permissions: before.permissions },
          after: { permissions: def.permissions },
        },
      });
    });
    return this.get(auth, id);
  }

  async delete(req: Request, auth: AuthContext, id: string): Promise<void> {
    const role = await this.get(auth, id);
    if (role.isSystem) throw forbidden('Built-in roles cannot be deleted');
    if (role.memberCount > 0)
      throw conflict(
        `${role.memberCount} ${role.memberCount === 1 ? 'person has' : 'people have'} this role. Move them to another role first.`,
      );
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit }) => {
      await tx.role.delete({ where: { id } });
      await audit({
        action: RoleActions.deleted,
        entityType: 'role',
        entityId: id,
        changes: { before: { name: role.name, permissions: role.permissions } },
      });
    });
  }
}

function sameSet(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && [...a].sort().every((v, i) => v === [...b].sort()[i]);
}
