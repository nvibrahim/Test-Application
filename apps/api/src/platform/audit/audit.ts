import { isAuditAction } from '@inspower/shared';
import type { Tx } from '../database/prisma.service';

export interface AuditContext {
  organizationId: string;
  actorId?: string | null;
  ip?: string | null;
  userAgent?: string | null;
  requestId?: string | null;
}

export interface AuditInput {
  action: string;
  entityType: string;
  entityId?: string | null;
  changes?: { before?: unknown; after?: unknown } | Record<string, unknown> | null;
}

/**
 * The only way to write an audit row. It takes the transaction client so the row is
 * committed with the change it describes, or not at all. Rows can never be changed or
 * deleted: the first migration adds a trigger that refuses both.
 */
export async function writeAudit(tx: Tx, ctx: AuditContext, input: AuditInput): Promise<void> {
  if (!isAuditAction(input.action)) {
    throw new Error(`Audit action "${input.action}" must be module.entity.action`);
  }
  await tx.auditLog.create({
    data: {
      organizationId: ctx.organizationId,
      action: input.action,
      actorId: ctx.actorId ?? null,
      entityType: input.entityType,
      entityId: input.entityId ?? null,
      changes:
        input.changes === undefined ? undefined : ((input.changes as object | null) ?? undefined),
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
      requestId: ctx.requestId ?? null,
    },
  });
}
