import { Injectable } from '@nestjs/common';
import type { OutboxEvent } from '@inspower/shared';
import { type AuditContext, type AuditInput, writeAudit } from '../audit/audit';
import { PrismaService, type Tx } from '../database/prisma.service';
import { queueEvent } from '../outbox/outbox';

export interface UnitOfWork {
  tx: Tx;
  /** Writes an audit row in this transaction. Every write that matters calls it. */
  audit(input: AuditInput): Promise<void>;
  /** Queues a realtime event in this transaction. */
  emit(event: OutboxEvent): Promise<void>;
}

/**
 * Every write goes through here: one transaction that holds the change, its audit row and
 * any realtime event. A service that writes without an audit call is a review finding.
 */
@Injectable()
export class TransactionService {
  constructor(private readonly prisma: PrismaService) {}

  async run<T>(ctx: AuditContext, work: (uow: UnitOfWork) => Promise<T>): Promise<T> {
    return this.prisma.$transaction(async (tx) => {
      const uow: UnitOfWork = {
        tx,
        audit: (input) => writeAudit(tx, ctx, input),
        emit: (event) => queueEvent(tx, ctx.organizationId, event),
      };
      return work(uow);
    });
  }
}
