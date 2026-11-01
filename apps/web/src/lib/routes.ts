import { z } from 'zod';

/**
 * Route metadata: every `(app)` page registers one of these. The server-component guard reads
 * `permission`, `feature` and `stage`; the sidebar, bottom bar and command palette are generated
 * from the registry. There is no hand-written navigation list.
 */
export const routeMetaSchema = z.object({
  path: z.string().startsWith('/'),
  title: z.string().min(1),
  permission: z.string().optional(),
  feature: z.string().optional(),
  stage: z.enum(['verify_two_factor', 'change_password', 'active']).optional(),
  group: z.string().optional(),
  icon: z.enum(['home', 'user', 'activity', 'settings', 'users', 'shield']).optional(),
  order: z.number().int().default(100),
  /** Shown in navigation (false for detail pages). */
  nav: z.boolean().default(true),
});
export type RouteMeta = z.infer<typeof routeMetaSchema>;

export function defineRoute(meta: z.input<typeof routeMetaSchema>): RouteMeta {
  return routeMetaSchema.parse(meta);
}

/** Every `(app)` page, in one place. Pages import their own entry from here. */
export const appRoutes = {
  dashboard: defineRoute({ path: '/dashboard', title: 'Dashboard', icon: 'home', order: 10 }),
  users: defineRoute({
    path: '/admin/users',
    title: 'Users',
    icon: 'users',
    permission: 'users.read',
    group: 'Administration',
    order: 100,
  }),
  profile: defineRoute({ path: '/profile', title: 'My profile', icon: 'user', order: 900 }),
  health: defineRoute({
    path: '/health',
    title: 'System health',
    icon: 'activity',
    permission: 'system.read',
    order: 800,
  }),
} as const;

/** The navigation a person may see, from their permissions. Super Admins see everything. */
export function navigationFor(input: {
  permissions: readonly string[];
  isSuperAdmin: boolean;
}): RouteMeta[] {
  return Object.values(appRoutes)
    .filter((r) => r.nav)
    .filter((r) => !r.permission || input.isSuperAdmin || input.permissions.includes(r.permission))
    .sort((a, b) => a.order - b.order);
}
