import type { PermissionDefinition } from './index.js';

export const systemPermissions: PermissionDefinition[] = [
  {
    key: 'system.read',
    module: 'system',
    label: 'View system status',
    description: 'Health details, background jobs and scheduled jobs.',
  },
];

/** Role keys the platform relies on. Phase 3 adds the editable built-in roles and custom roles. */
export const SUPER_ADMIN_ROLE_KEY = 'super_admin';
