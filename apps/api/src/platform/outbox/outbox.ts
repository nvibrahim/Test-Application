import { outboxEventSchema, type OutboxEvent } from '@inspower/shared';
import type { Tx } from '../database/prisma.service';

/** Realtime events are written with the change, in the same transaction; the worker publishes them. */
export async function queueEvent(
  tx: Tx,
  organizationId: string,
  event: OutboxEvent,
): Promise<void> {
  const parsed = outboxEventSchema.parse(event);
  await tx.outboxEvent.create({
    data: {
      organizationId,
      name: parsed.name,
      channels: parsed.channels,
      payload: parsed.payload as object,
    },
  });
}

/** Redis pub/sub channel the API's realtime gateway listens on (Phase 1 adds the gateway). */
export const OUTBOX_CHANNEL = 'outbox';
