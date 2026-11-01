import { z } from 'zod';

/**
 * Route metadata: every `(app)` page exports one of these. A single server-component guard
 * reads it (Phase 1 and 3), and the sidebar, command palette and breadcrumbs are generated
 * from it. There is no hand-written navigation list.
 */
export const routeMetaSchema = z.object({
  title: z.string().min(1),
  permission: z.string().optional(),
  feature: z.string().optional(),
  stage: z.enum(['verify_two_factor', 'change_password', 'active']).optional(),
  group: z.string().optional(),
  icon: z.string().optional(),
  order: z.number().int().optional(),
});
export type RouteMeta = z.infer<typeof routeMetaSchema>;

export function defineRoute(meta: RouteMeta): RouteMeta {
  return routeMetaSchema.parse(meta);
}
