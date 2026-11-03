import { Body, Controller, Get, Param, Post, Put, Req } from '@nestjs/common';
import type { Request } from 'express';
import { createLocationSchema, updateLocationSchema, type Location } from '@inspower/shared';
import { z } from 'zod';
import { PrismaService } from '../../platform/database/prisma.service';
import { ApiException, conflict, notFound } from '../../platform/http/api-error';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { TransactionService } from '../../platform/transaction/transaction.service';
import { RequirePermissions } from '../access/decorators';
import { authOf } from '../access/request-context';
import { scopeOf } from '../access/scoped';
import { ctxOf } from '../auth/credentials.service';

type Create = ReturnType<typeof createLocationSchema.parse>;
type Update = ReturnType<typeof updateLocationSchema.parse>;
const uuid = new ZodPipe(z.string().uuid());

/** Locations: exactly one head office, which cannot be made inactive; never deleted, only inactive. */
@Controller('locations')
export class LocationsController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
  ) {}

  private readonly include = { manager: false } as const;

  private async toLocation(l: {
    id: string;
    name: string;
    isHeadOffice: boolean;
    isActive: boolean;
    timeZone: string | null;
    addressLines: string[];
    managerUserId: string | null;
    version: number;
  }): Promise<Location> {
    const manager = l.managerUserId
      ? await this.prisma.user.findUnique({
          where: { id: l.managerUserId },
          select: { fullName: true },
        })
      : null;
    return {
      id: l.id,
      name: l.name,
      isHeadOffice: l.isHeadOffice,
      isActive: l.isActive,
      timeZone: l.timeZone,
      addressLines: l.addressLines,
      managerUserId: l.managerUserId,
      managerName: manager?.fullName ?? null,
      version: l.version,
    };
  }

  @RequirePermissions('locations.read')
  @Get()
  async list(@Req() req: Request) {
    const auth = authOf(req);
    const visible = scopeOf(auth);
    const rows = await this.prisma.location.findMany({
      where: {
        organizationId: auth.organizationId,
        ...(visible ? { id: { in: [...visible] } } : {}),
      },
      orderBy: [{ isHeadOffice: 'desc' }, { isActive: 'desc' }, { name: 'asc' }],
    });
    return { locations: await Promise.all(rows.map((r) => this.toLocation(r))) };
  }

  @RequirePermissions('locations.manage')
  @Post()
  async create(@Req() req: Request, @Body(new ZodPipe(createLocationSchema)) body: Create) {
    const auth = authOf(req);
    await this.checkManager(auth.organizationId, body.managerUserId);
    const row = await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      const dup = await tx.location.findFirst({
        where: {
          organizationId: auth.organizationId,
          name: { equals: body.name, mode: 'insensitive' },
        },
      });
      if (dup) throw conflict('A location with this name already exists');
      const created = await tx.location.create({
        data: {
          organizationId: auth.organizationId,
          name: body.name,
          timeZone: body.timeZone,
          addressLines: body.addressLines,
          managerUserId: body.managerUserId,
          createdBy: auth.userId,
        },
      });
      await audit({
        action: 'organization.location.created',
        entityType: 'location',
        entityId: created.id,
        changes: { after: body },
      });
      await emit({
        name: 'organization.location.created',
        channels: ['organization'],
        payload: { id: created.id },
      });
      return created;
    });
    return this.toLocation(row);
  }

  @RequirePermissions('locations.manage')
  @Put(':id')
  async update(
    @Req() req: Request,
    @Param('id', uuid) id: string,
    @Body(new ZodPipe(updateLocationSchema)) body: Update,
  ) {
    const auth = authOf(req);
    const before = await this.prisma.location.findFirst({
      where: { id, organizationId: auth.organizationId },
    });
    if (!before) throw notFound('Location not found');
    if (before.version !== body.version)
      throw conflict('Someone else saved this location first. Reload and try again.');
    if (before.isHeadOffice && body.isActive === false)
      throw new ApiException('conflict', 'The head office cannot be made inactive');
    if (body.managerUserId !== undefined)
      await this.checkManager(auth.organizationId, body.managerUserId);
    const { version: _v, ...changes } = body;
    const row = await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      const updated = await tx.location.update({
        where: { id },
        data: { ...changes, version: { increment: 1 }, updatedBy: auth.userId },
      });
      await audit({
        action: 'organization.location.updated',
        entityType: 'location',
        entityId: id,
        changes: { before: { name: before.name, isActive: before.isActive }, after: changes },
      });
      await emit({
        name: 'organization.location.updated',
        channels: ['organization'],
        payload: { id },
      });
      return updated;
    });
    return this.toLocation(row);
  }

  private async checkManager(
    organizationId: string,
    userId: string | null | undefined,
  ): Promise<void> {
    if (!userId) return;
    const n = await this.prisma.user.count({
      where: { id: userId, organizationId, status: 'active' },
    });
    if (!n) throw new ApiException('validation_failed', 'Unknown manager');
  }
}
