import { Controller, Get, HttpCode, Param, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { userListQuerySchema, type UserListItem } from '@inspower/shared';
import { z } from 'zod';
import { PrismaService } from '../../platform/database/prisma.service';
import { ZodPipe } from '../../platform/http/zod.pipe';
import { RequirePermissions, RequireStepUp } from '../access/decorators';
import { authOf } from '../access/request-context';
import { TwoFactorService } from '../two-factor/two-factor.service';

type Query = ReturnType<typeof userListQuerySchema.parse>;

/** The Users list, first version: who is here and whether two-step verification is on. Phase 3 adds the rest. */
@Controller('users')
export class UsersController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly twoFactor: TwoFactorService,
  ) {}

  @RequirePermissions('users.read')
  @Get()
  async list(
    @Req() req: Request,
    @Query(new ZodPipe(userListQuerySchema)) query: Query,
  ): Promise<{ users: UserListItem[]; total: number }> {
    const auth = authOf(req);
    const rows = await this.prisma.user.findMany({
      where: {
        organizationId: auth.organizationId,
        status: { not: 'anonymised' },
        ...(query.q
          ? {
              OR: [
                { fullName: { contains: query.q, mode: 'insensitive' } },
                { email: { contains: query.q, mode: 'insensitive' } },
              ],
            }
          : {}),
        ...(query.twoFactor === 'on' ? { twoFactor: { confirmedAt: { not: null } } } : {}),
        ...(query.twoFactor === 'off'
          ? { OR: [{ twoFactor: null }, { twoFactor: { confirmedAt: null } }] }
          : {}),
      },
      orderBy: { fullName: 'asc' },
      include: {
        twoFactor: { select: { confirmedAt: true } },
        roles: { select: { role: { select: { name: true } } } },
      },
      take: 500,
    });
    return {
      users: rows.map((u) => ({
        id: u.id,
        email: u.email,
        fullName: u.fullName,
        status: u.status,
        roles: u.roles.map((r) => r.role.name),
        twoFactorEnabled: u.twoFactor?.confirmedAt != null,
        lastSignInAt: u.lastSignInAt?.toISOString() ?? null,
        createdAt: u.createdAt.toISOString(),
      })),
      total: rows.length,
    };
  }

  @RequirePermissions('users.manage')
  @RequireStepUp()
  @Post(':id/two-factor/reset')
  @HttpCode(204)
  async reset(
    @Req() req: Request,
    @Param('id', new ZodPipe(z.string().uuid())) id: string,
  ): Promise<void> {
    await this.twoFactor.adminReset(req, authOf(req), id);
  }

  @RequirePermissions('users.manage')
  @Post(':id/two-factor/remind')
  @HttpCode(204)
  async remind(
    @Req() req: Request,
    @Param('id', new ZodPipe(z.string().uuid())) id: string,
  ): Promise<void> {
    await this.twoFactor.sendReminderNow(req, authOf(req), id);
  }
}
