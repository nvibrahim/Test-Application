import type { PermissionDefinition } from './index.js';

export const systemPermissions: PermissionDefinition[] = [
  {
    key: 'system.read',
    module: 'system',
    label: 'View system status',
    description: 'Health details, background jobs and scheduled jobs.',
  },
  {
    key: 'jobs.manage',
    module: 'system',
    label: 'Manage background jobs',
    description: 'Retry, cancel and remove jobs; pause, resume and run scheduled jobs.',
  },
  {
    key: 'features.manage',
    module: 'system',
    label: 'Manage feature switches',
    description: 'Turn features on or off, for everyone or for chosen people.',
  },
];

/** Role keys the platform relies on. */
export const SUPER_ADMIN_ROLE_KEY = 'super_admin';
export const ADMINISTRATOR_ROLE_KEY = 'administrator';
export const MEMBER_ROLE_KEY = 'member';
export const VIEWER_ROLE_KEY = 'viewer';
