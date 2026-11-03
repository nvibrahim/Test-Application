import { adminEventKeys, emailProviderPresets, type SettingsSectionKey } from '@inspower/shared';

/**
 * How each settings section is drawn: one entry per field, with a dotted path into the
 * section's value. The Zod schema in the shared package stays the single source of validation;
 * this only decides the control and the words.
 */
export type FieldSpec =
  | {
      path: string;
      label: string;
      help?: string;
      type: 'text' | 'email' | 'url' | 'password' | 'time';
    }
  | { path: string; label: string; help?: string; type: 'number'; min?: number; max?: number }
  | { path: string; label: string; help?: string; type: 'boolean' }
  | {
      path: string;
      label: string;
      help?: string;
      type: 'select';
      options: { value: string | number; label: string }[];
    }
  | { path: string; label: string; help?: string; type: 'textarea' }
  | { path: string; label: string; help?: string; type: 'list'; itemLabel: string }
  | {
      path: string;
      label: string;
      help?: string;
      type: 'multi';
      options: { value: string; label: string }[];
    };

export interface SectionGroup {
  title?: string;
  fields: FieldSpec[];
}

const adminEventLabels: Record<(typeof adminEventKeys)[number], string> = {
  'security.lockout': 'An account was locked out',
  'security.new_device': 'A new device signed in',
  'security.settings_changed': 'Security settings changed',
  'security.two_factor_reset': 'Two-step verification was reset for someone',
  'users.invitation_accepted': 'An invitation was accepted',
  'backups.failed': 'A backup failed',
  'backups.missed': 'A backup was missed',
  'backups.drill_failed': 'A restore drill failed',
  'system.maintenance_changed': 'Maintenance mode changed',
};

export const sectionFields: Record<SettingsSectionKey, SectionGroup[]> = {
  general: [
    {
      fields: [
        {
          path: 'appName',
          label: 'Application name',
          type: 'text',
          help: 'Shown in the sidebar, the browser tab, sign-in and emails.',
        },
        { path: 'tagline', label: 'Tagline', type: 'text' },
        {
          path: 'supportEmail',
          label: 'Support email',
          type: 'email',
          help: 'Shown on the landing page and used by the contact form.',
        },
      ],
    },
    {
      title: 'Landing page',
      fields: [
        { path: 'landing.headline', label: 'Headline', type: 'text' },
        { path: 'landing.intro', label: 'Introduction', type: 'textarea' },
        { path: 'landing.showContactForm', label: 'Show the contact form', type: 'boolean' },
      ],
    },
  ],
  appearance: [
    {
      fields: [
        {
          path: 'brandColor',
          label: 'Main colour',
          type: 'text',
          help: 'A colour like #1D4ED8, or blank for the built-in blue. Every shade for light and dark is worked out from it.',
        },
        {
          path: 'sidebarStyle',
          label: 'Sidebar',
          type: 'select',
          options: [
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
            { value: 'brand', label: 'Main colour' },
          ],
        },
        {
          path: 'topBarStyle',
          label: 'Top bar',
          type: 'select',
          options: [
            { value: 'plain', label: 'Plain' },
            { value: 'brand', label: 'Main colour' },
          ],
        },
        {
          path: 'signInPanel',
          label: 'Sign-in page panel',
          type: 'select',
          options: [
            { value: 'brand', label: 'Main colour' },
            { value: 'image', label: 'Uploaded picture' },
          ],
        },
        {
          path: 'defaultTheme',
          label: 'Default theme for new people',
          type: 'select',
          options: [
            { value: 'system', label: 'Match the device' },
            { value: 'light', label: 'Light' },
            { value: 'dark', label: 'Dark' },
          ],
        },
        {
          path: 'defaultDensity',
          label: 'Default table density',
          type: 'select',
          options: [
            { value: 'comfortable', label: 'Comfortable' },
            { value: 'compact', label: 'Compact' },
          ],
        },
        {
          path: 'cornerRadius',
          label: 'Corners',
          type: 'select',
          options: [
            { value: 'small', label: 'Small' },
            { value: 'medium', label: 'Medium' },
            { value: 'large', label: 'Large' },
          ],
        },
      ],
    },
  ],
  localization: [
    {
      fields: [
        {
          path: 'language',
          label: 'Language',
          type: 'select',
          options: [{ value: 'en', label: 'English' }],
        },
        {
          path: 'dateFormat',
          label: 'Date format',
          type: 'select',
          options: ['dd/MM/yyyy', 'MM/dd/yyyy', 'yyyy-MM-dd', 'd MMM yyyy'].map((v) => ({
            value: v,
            label: v,
          })),
        },
        {
          path: 'timeFormat',
          label: 'Time format',
          type: 'select',
          options: [
            { value: '24h', label: '24-hour' },
            { value: '12h', label: '12-hour' },
          ],
        },
        {
          path: 'numberLocale',
          label: 'Number format (locale)',
          type: 'text',
          help: 'For example en-GB, en-US, de-DE.',
        },
        {
          path: 'weekStartsOn',
          label: 'Week starts on',
          type: 'select',
          options: [
            { value: 1, label: 'Monday' },
            { value: 0, label: 'Sunday' },
            { value: 6, label: 'Saturday' },
          ],
        },
      ],
    },
  ],
  security: [
    {
      title: 'Sessions',
      fields: [
        {
          path: 'session.idleMinutes',
          label: 'Sign out after inactivity (minutes)',
          type: 'number',
          min: 5,
          max: 1440,
        },
        {
          path: 'session.warningMinutes',
          label: 'Warn before signing out (minutes)',
          type: 'number',
          min: 1,
          max: 30,
        },
        {
          path: 'session.absoluteHours',
          label: 'Sign out after (hours), whatever the activity',
          type: 'number',
          min: 1,
          max: 720,
        },
        {
          path: 'session.rememberMeDays',
          label: '“Remember me” keeps a session for (days)',
          type: 'number',
          min: 1,
          max: 90,
        },
      ],
    },
    {
      title: 'Wrong passwords',
      fields: [
        {
          path: 'lockout.delayAfterAttempts',
          label: 'Growing delays start after (attempts)',
          type: 'number',
          min: 1,
          max: 20,
        },
        {
          path: 'lockout.lockAfterAttempts',
          label: 'Lock the account after (attempts)',
          type: 'number',
          min: 2,
          max: 50,
        },
        {
          path: 'lockout.lockMinutes',
          label: 'Lock for (minutes)',
          type: 'number',
          min: 1,
          max: 1440,
        },
        {
          path: 'lockout.perIpAttempts',
          label: 'Block an address after (attempts)',
          type: 'number',
          min: 10,
          max: 1000,
        },
      ],
    },
    {
      title: 'Passwords',
      fields: [
        { path: 'password.minLength', label: 'Minimum length', type: 'number', min: 8, max: 64 },
        {
          path: 'password.superAdminMinLength',
          label: 'Minimum length for a Super Admin',
          type: 'number',
          min: 8,
          max: 64,
        },
        {
          path: 'password.minStrengthScore',
          label: 'Minimum strength (2 to 4)',
          type: 'number',
          min: 2,
          max: 4,
        },
        {
          path: 'password.breachedPasswordCheck',
          label: 'Refuse passwords seen in data breaches',
          type: 'boolean',
        },
        {
          path: 'password.historyCount',
          label: 'Remember the last (passwords)',
          type: 'number',
          min: 0,
          max: 24,
        },
        {
          path: 'password.expiryDays',
          label: 'Passwords expire after (days, 0 = never)',
          type: 'number',
          min: 0,
          max: 365,
        },
      ],
    },
    {
      title: 'Two-step verification',
      fields: [
        {
          path: 'twoFactor.policy',
          label: 'Policy',
          type: 'select',
          options: [
            { value: 'optional', label: 'Optional, with reminders' },
            {
              value: 'required_admins',
              label: 'Required for administrators (reserved for a later release)',
            },
            {
              value: 'required_all',
              label: 'Required for everyone (reserved for a later release)',
            },
          ],
        },
        {
          path: 'twoFactor.reminderIntervalDays',
          label: 'Show the reminder banner again after (days)',
          type: 'number',
          min: 1,
          max: 90,
        },
        {
          path: 'twoFactor.reminderEmails',
          label: 'Send reminder emails on day 1, 7 and 30',
          type: 'boolean',
        },
        {
          path: 'twoFactor.trustedDeviceDays',
          label: 'Trust a device for (days, 0 = never)',
          type: 'number',
          min: 0,
          max: 90,
        },
        {
          path: 'stepUpMinutes',
          label: 'Ask for the password again after (minutes) for sensitive actions',
          type: 'number',
          min: 1,
          max: 60,
        },
      ],
    },
  ],
  email: [
    {
      fields: [
        {
          path: 'host',
          label: 'Mail server',
          type: 'text',
          help: 'Blank sends through the environment (Mailpit locally).',
        },
        { path: 'port', label: 'Port', type: 'number', min: 1, max: 65535 },
        {
          path: 'security',
          label: 'Security',
          type: 'select',
          options: [
            { value: 'starttls', label: 'STARTTLS (usual on 587)' },
            { value: 'tls', label: 'TLS (usual on 465)' },
            { value: 'none', label: 'None' },
          ],
        },
        { path: 'user', label: 'User name', type: 'text' },
        {
          path: 'password',
          label: 'Password',
          type: 'password',
          help: 'Leave blank to keep the saved one.',
        },
        { path: 'fromName', label: 'From name', type: 'text' },
        { path: 'fromAddress', label: 'From address', type: 'email' },
        { path: 'replyTo', label: 'Reply-to address', type: 'email' },
      ],
    },
  ],
  notifications: [
    {
      fields: [
        {
          path: 'emailAdminsOn',
          label: 'Email administrators when',
          type: 'multi',
          options: adminEventKeys.map((k) => ({ value: k, label: adminEventLabels[k] })),
        },
        {
          path: 'extraRecipients',
          label: 'Also email these addresses',
          type: 'list',
          itemLabel: 'Email address',
        },
      ],
    },
  ],
  backups: [
    {
      fields: [
        { path: 'nightlyAt', label: 'Nightly backup at (organization time)', type: 'time' },
        { path: 'retention.daily', label: 'Keep daily backups', type: 'number', min: 1, max: 90 },
        { path: 'retention.weekly', label: 'Keep weekly backups', type: 'number', min: 0, max: 52 },
        {
          path: 'retention.monthly',
          label: 'Keep monthly backups',
          type: 'number',
          min: 0,
          max: 60,
        },
        {
          path: 'restoreDrill',
          label: 'Restore drill',
          type: 'select',
          options: [
            { value: 'weekly', label: 'Weekly' },
            { value: 'off', label: 'Off' },
          ],
        },
        {
          path: 'pingUrl',
          label: 'Ping this URL after each nightly backup',
          type: 'url',
          help: 'A Healthchecks-style address; blank for none.',
        },
      ],
    },
  ],
  maintenance: [
    {
      fields: [
        {
          path: 'enabled',
          label: 'Maintenance mode is on',
          type: 'boolean',
          help: 'Everyone except the roles below sees the message instead of the app.',
        },
        { path: 'message', label: 'Message', type: 'textarea' },
        {
          path: 'allowedRoleKeys',
          label: 'Roles that may keep using the app',
          type: 'multi',
          options: [
            { value: 'super_admin', label: 'Super Admin' },
            { value: 'administrator', label: 'Administrator' },
            { value: 'member', label: 'Member' },
            { value: 'viewer', label: 'Viewer' },
          ],
        },
      ],
    },
  ],
};

export { emailProviderPresets };
