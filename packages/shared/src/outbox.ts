import { z } from 'zod';
import { auditActionPattern } from './audit.js';

/** Realtime events share the audit naming: `module.entity.action`. */
export const outboxEventNameSchema = z.string().regex(auditActionPattern);

/** Who may receive an event. `user:<id>`, `session:<id>`, `organization`, `admin`. */
export const outboxChannelSchema = z.union([
  z.literal('organization'),
  z.literal('admin'),
  z.string().regex(/^user:[0-9a-f-]{36}$/),
  z.string().regex(/^session:[0-9a-f-]{36}$/),
]);
export type OutboxChannel = z.infer<typeof outboxChannelSchema>;

export const outboxEventSchema = z.object({
  name: outboxEventNameSchema,
  channels: z.array(outboxChannelSchema).min(1),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type OutboxEvent = z.infer<typeof outboxEventSchema>;
