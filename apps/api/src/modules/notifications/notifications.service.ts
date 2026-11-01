import { Injectable } from '@nestjs/common';
import type { Tx } from '../../platform/database/prisma.service';

/** In-app notifications. Phase 4 adds the type registry, per-user preferences and the bell. */
@Injectable()
export class NotificationsService {
  async notify(
    tx: Tx,
    input: {
      organizationId: string;
      userId: string;
      type: string;
      title: string;
      body?: string;
      link?: string;
    },
  ): Promise<void> {
    await tx.notification.create({
      data: {
        organizationId: input.organizationId,
        userId: input.userId,
        type: input.type,
        title: input.title,
        body: input.body ?? null,
        link: input.link ?? null,
      },
    });
  }
}
