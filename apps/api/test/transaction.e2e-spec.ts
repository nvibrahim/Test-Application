import type { INestApplication } from '@nestjs/common';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaService } from '../src/platform/database/prisma.service';
import { TransactionService } from '../src/platform/transaction/transaction.service';
import { createTestApp } from './app';

let app: INestApplication;
let prisma: PrismaService;
let transactions: TransactionService;
const organizationId = '019a0000-0000-7000-8000-000000000001';

beforeAll(async () => {
  ({ app, prisma } = await createTestApp());
  transactions = app.get(TransactionService);
  await prisma.outboxEvent.deleteMany({ where: { organizationId } });
});
afterAll(async () => app.close());

describe('the transaction helper', () => {
  it('commits the change, its audit row and its outbox event together', async () => {
    const ctx = { organizationId, requestId: 'req-1', ip: '127.0.0.1' };
    const before = await prisma.auditLog.count({ where: { organizationId } });
    await transactions.run(ctx, async ({ tx, audit, emit }) => {
      await tx.featureFlag.upsert({
        where: { key: 'test.flag' },
        update: { state: 'on' },
        create: { key: 'test.flag', organizationId, state: 'on' },
      });
      await audit({
        action: 'features.flag.updated',
        entityType: 'feature_flag',
        entityId: 'test.flag',
      });
      await emit({
        name: 'features.flag.updated',
        channels: ['admin'],
        payload: { key: 'test.flag' },
      });
    });
    expect(await prisma.auditLog.count({ where: { organizationId } })).toBe(before + 1);
    const event = await prisma.outboxEvent.findFirst({
      where: { organizationId, name: 'features.flag.updated' },
    });
    expect(event?.channels).toEqual(['admin']);
    expect(event?.publishedAt).toBeNull();
  });

  it('rolls everything back when the work throws', async () => {
    const before = await prisma.auditLog.count({ where: { organizationId } });
    await expect(
      transactions.run({ organizationId }, async ({ tx, audit }) => {
        await tx.featureFlag.upsert({
          where: { key: 'test.rollback' },
          update: {},
          create: { key: 'test.rollback', organizationId },
        });
        await audit({
          action: 'features.flag.created',
          entityType: 'feature_flag',
          entityId: 'test.rollback',
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await prisma.auditLog.count({ where: { organizationId } })).toBe(before);
    expect(await prisma.featureFlag.findUnique({ where: { key: 'test.rollback' } })).toBeNull();
  });

  it('refuses an audit action that is not module.entity.action', async () => {
    await expect(
      transactions.run({ organizationId }, ({ audit }) =>
        audit({ action: 'bad', entityType: 'x' }),
      ),
    ).rejects.toThrow(/module\.entity\.action/);
  });

  it('cannot change or delete an audit row (database trigger)', async () => {
    const row = await prisma.auditLog.findFirst({ where: { organizationId } });
    expect(row).not.toBeNull();
    await expect(
      prisma.auditLog.update({ where: { id: row!.id }, data: { action: 'tampered.row.update' } }),
    ).rejects.toThrow(/append-only/);
    await expect(prisma.auditLog.delete({ where: { id: row!.id } })).rejects.toThrow(/append-only/);
  });
});
