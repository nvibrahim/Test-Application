import type { PermissionDefinition } from './index.js';

export const usersPermissions: PermissionDefinition[] = [
  {
    key: 'users.read',
    module: 'users',
    label: 'View users',
    description: 'The list of people, their roles and whether two-step verification is on.',
  },
  {
    key: 'users.manage',
    module: 'users',
    label: 'Manage users',
    description:
      'Reset two-step verification, send reminders; from Phase 3 also invite, disable and anonymise.',
  },
];
