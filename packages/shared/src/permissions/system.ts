import type { PermissionDefinition } from './index.js';

export const systemPermissions: PermissionDefinition[] = [
  {
    key: 'system.read',
    module: 'system',
    label: 'View system status',
    description: 'Health details, background jobs and scheduled jobs.',
  },
];
