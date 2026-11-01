import type { PermissionDefinition } from './index.js';

export const organizationPermissions: PermissionDefinition[] = [
  {
    key: 'organization.read',
    module: 'organization',
    label: 'View the organization profile',
    description: 'Legal and trading names, country, currency, formats.',
  },
  {
    key: 'organization.manage',
    module: 'organization',
    label: 'Edit the organization profile',
    description: 'Sensitive fields ask for step-up.',
  },
  {
    key: 'locations.read',
    module: 'organization',
    label: 'View locations',
    description: 'Head office and branches.',
  },
  {
    key: 'locations.manage',
    module: 'organization',
    label: 'Manage locations',
    description: 'Add, edit and deactivate locations.',
  },
  {
    key: 'settings.read',
    module: 'settings',
    label: 'View settings',
    description: 'Every settings section, with secrets shown as set or not set.',
  },
  {
    key: 'settings.manage',
    module: 'settings',
    label: 'Edit settings',
    description: 'General, Appearance, Localization, Email, Notifications and Maintenance.',
  },
  {
    key: 'settings.security.manage',
    module: 'settings',
    label: 'Edit security settings',
    description:
      'Session timeouts, password rules, lockout, two-step policy. Reserved to the Super Admin.',
    superAdminOnly: true,
  },
  {
    key: 'audit.read',
    module: 'audit',
    label: 'View the audit log',
    description: 'Who did what, when.',
  },
  {
    key: 'audit.export',
    module: 'audit',
    label: 'Export the audit log',
    description: 'CSV export; asks for step-up.',
  },
  {
    key: 'backups.read',
    module: 'backups',
    label: 'View backups',
    description: 'The list, sizes, status and the last restore drill.',
  },
  {
    key: 'backups.run',
    module: 'backups',
    label: 'Run and download backups',
    description: 'Back up now and download; asks for step-up.',
  },
  {
    key: 'backups.restore',
    module: 'backups',
    label: 'Restore a backup',
    description: 'Schedules a restore. Reserved to the Super Admin.',
    superAdminOnly: true,
  },
  {
    key: 'notifications.manage',
    module: 'notifications',
    label: 'Manage notification defaults',
    description: 'Which events email administrators.',
  },
];
