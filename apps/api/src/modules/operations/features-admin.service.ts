import { Injectable } from '@nestjs/common';
import type { Request } from 'express';
import {
  featureSwitchRegistry,
  featureVisible,
  type FeatureState,
  type FeatureSwitch,
} from '@inspower/shared';
import { PrismaService } from '../../platform/database/prisma.service';
import { notFound } from '../../platform/http/api-error';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { OperationsActions } from './operations.actions';

/** The feature switches screen: registry entries with their saved state and chosen people. */
@Injectable()
export class FeaturesAdminService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
  ) {}

  async list(auth: AuthContext): Promise<FeatureSwitch[]> {
    // Keys are global in a one-organization database; the row carries the organization for later sharing.
    const rows = await this.prisma.featureFlag.findMany({
      where: { key: { in: featureSwitchRegistry.map((f) => f.key) } },
      include: {
        users: { include: { user: { select: { id: true, fullName: true, email: true } } } },
      },
    });
    const byKey = new Map(rows.map((r) => [r.key, r]));
    const updaterIds = [...new Set(rows.map((r) => r.updatedBy).filter((v): v is string => !!v))];
    const updaters = updaterIds.length
      ? await this.prisma.user.findMany({
          where: { id: { in: updaterIds } },
          select: { id: true, fullName: true },
        })
      : [];
    const names = new Map(updaters.map((u) => [u.id, u.fullName]));
    return featureSwitchRegistry.map((f) => {
      const row = byKey.get(f.key);
      return {
        key: f.key,
        label: f.label,
        description: f.description,
        module: f.module,
        state: row?.state ?? 'off',
        users: row?.users.map((u) => u.user) ?? [],
        updatedAt: row?.updatedAt.toISOString() ?? null,
        updatedByName: row?.updatedBy ? (names.get(row.updatedBy) ?? null) : null,
      };
    });
  }

  /** Keys the signed-in person may use right now. */
  async mine(auth: AuthContext): Promise<string[]> {
    const rows = await this.prisma.featureFlag.findMany({
      where: { key: { in: featureSwitchRegistry.map((f) => f.key) } },
      include: { users: { where: { userId: auth.userId }, select: { userId: true } } },
    });
    return rows
      .filter((r) =>
        featureVisible(r.state, { isSuperAdmin: auth.isSuperAdmin, selected: r.users.length > 0 }),
      )
      .map((r) => r.key);
  }

  async update(
    req: Request,
    auth: AuthContext,
    key: string,
    state: FeatureState,
    userIds: string[],
  ): Promise<void> {
    if (!featureSwitchRegistry.some((f) => f.key === key)) throw notFound('Unknown feature');
    const before = await this.prisma.featureFlag.findUnique({
      where: { key },
      include: { users: true },
    });
    const people = state === 'selected_users' ? userIds : [];
    await this.transactions.run(ctxOf(req, auth), async ({ tx, audit, emit }) => {
      await tx.featureFlag.upsert({
        where: { key },
        update: { state, updatedBy: auth.userId, organizationId: auth.organizationId },
        create: { key, organizationId: auth.organizationId, state, updatedBy: auth.userId },
      });
      await tx.featureFlagUser.deleteMany({ where: { flagKey: key } });
      if (people.length) {
        const valid = await tx.user.findMany({
          where: { id: { in: people }, organizationId: auth.organizationId },
          select: { id: true },
        });
        await tx.featureFlagUser.createMany({
          data: valid.map((u) => ({
            flagKey: key,
            userId: u.id,
            organizationId: auth.organizationId,
          })),
        });
      }
      await audit({
        action: OperationsActions.featureChanged,
        entityType: 'feature',
        entityId: key,
        changes: {
          before: {
            state: before?.state ?? 'off',
            users: before?.users.map((u) => u.userId) ?? [],
          },
          after: { state, users: people },
        },
      });
      await emit({ name: 'features.switch.changed', channels: ['organization'], payload: { key } });
    });
  }
}
