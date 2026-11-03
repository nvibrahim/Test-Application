import { Injectable } from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  csvLine,
  type AuditLogEntry,
  type AuditLogQuery,
  type AuditLogResponse,
} from '@inspower/shared';
import { PrismaService } from '../../platform/database/prisma.service';
import { TransactionService } from '../../platform/transaction/transaction.service';
import type { AuthContext } from '../access/request-context';
import { ctxOf } from '../auth/credentials.service';
import { OperationsActions } from './operations.actions';

const EXPORT_LIMIT = 50_000;

/** The audit log, read only (the table refuses updates and deletes). */
@Injectable()
export class AuditLogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly transactions: TransactionService,
  ) {}

  private where(auth: AuthContext, q: AuditLogQuery) {
    return {
      organizationId: auth.organizationId,
      ...(q.actorId ? { actorId: q.actorId } : {}),
      ...(q.action
        ? q.action.endsWith('.')
          ? { action: { startsWith: q.action } }
          : { action: q.action }
        : {}),
      ...(q.entityType ? { entityType: q.entityType } : {}),
      ...(q.entityId ? { entityId: q.entityId } : {}),
      ...(q.from || q.to
        ? {
            createdAt: {
              ...(q.from ? { gte: new Date(q.from) } : {}),
              ...(q.to ? { lte: new Date(q.to) } : {}),
            },
          }
        : {}),
    };
  }

  private async withNames<T extends { actorId: string | null }>(
    rows: T[],
  ): Promise<Map<string, string>> {
    const ids = [...new Set(rows.map((r) => r.actorId).filter((v): v is string => !!v))];
    if (!ids.length) return new Map();
    const users = await this.prisma.user.findMany({
      where: { id: { in: ids } },
      select: { id: true, fullName: true },
    });
    return new Map(users.map((u) => [u.id, u.fullName]));
  }

  async list(auth: AuthContext, q: AuditLogQuery): Promise<AuditLogResponse> {
    const rows = await this.prisma.auditLog.findMany({
      where: this.where(auth, q),
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: q.limit + 1,
      ...(q.cursor ? { cursor: { id: q.cursor }, skip: 1 } : {}),
    });
    const page = rows.slice(0, q.limit);
    const names = await this.withNames(page);
    const [actions, entityTypes] = await Promise.all([
      this.prisma.auditLog.findMany({
        where: { organizationId: auth.organizationId },
        distinct: ['action'],
        select: { action: true },
        orderBy: { action: 'asc' },
      }),
      this.prisma.auditLog.findMany({
        where: { organizationId: auth.organizationId },
        distinct: ['entityType'],
        select: { entityType: true },
        orderBy: { entityType: 'asc' },
      }),
    ]);
    return {
      entries: page.map((r) => this.entry(r, names)),
      nextCursor: rows.length > q.limit ? (page[page.length - 1]?.id ?? null) : null,
      actions: actions.map((a) => a.action),
      entityTypes: entityTypes.map((e) => e.entityType),
    };
  }

  private entry(
    r: {
      id: string;
      action: string;
      actorId: string | null;
      entityType: string;
      entityId: string | null;
      changes: unknown;
      ip: string | null;
      userAgent: string | null;
      createdAt: Date;
    },
    names: Map<string, string>,
  ): AuditLogEntry {
    return {
      id: r.id,
      action: r.action,
      actorId: r.actorId,
      actorName: r.actorId ? (names.get(r.actorId) ?? null) : null,
      entityType: r.entityType,
      entityId: r.entityId,
      changes: r.changes ?? null,
      ip: r.ip,
      userAgent: r.userAgent,
      createdAt: r.createdAt.toISOString(),
    };
  }

  /** Streams the filtered log as CSV (newest first, up to 50 000 rows); the export is itself audited first. */
  async exportCsv(req: Request, auth: AuthContext, q: AuditLogQuery, res: Response): Promise<void> {
    await this.transactions.run(ctxOf(req, auth), ({ audit }) =>
      audit({
        action: OperationsActions.auditExported,
        entityType: 'audit_log',
        changes: {
          filters: {
            actorId: q.actorId,
            action: q.action,
            entityType: q.entityType,
            entityId: q.entityId,
            from: q.from,
            to: q.to,
          },
        },
      }),
    );
    res.setHeader('content-type', 'text/csv; charset=utf-8');
    res.setHeader(
      'content-disposition',
      `attachment; filename="audit-log-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.setHeader('cache-control', 'no-store');
    res.write('﻿');
    res.write(
      `${csvLine(['When (UTC)', 'Action', 'Actor', 'Actor id', 'Entity type', 'Entity id', 'IP', 'User agent', 'Changes'])}\r\n`,
    );
    let cursor: string | undefined;
    let written = 0;
    while (written < EXPORT_LIMIT) {
      const rows = await this.prisma.auditLog.findMany({
        where: this.where(auth, q),
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 1000,
        ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
      });
      if (!rows.length) break;
      const names = await this.withNames(rows);
      for (const r of rows) {
        res.write(
          `${csvLine([
            r.createdAt.toISOString(),
            r.action,
            r.actorId ? (names.get(r.actorId) ?? '') : 'system',
            r.actorId,
            r.entityType,
            r.entityId,
            r.ip,
            r.userAgent,
            r.changes,
          ])}\r\n`,
        );
      }
      written += rows.length;
      cursor = rows[rows.length - 1]?.id;
      if (rows.length < 1000) break;
    }
    res.end();
  }
}
