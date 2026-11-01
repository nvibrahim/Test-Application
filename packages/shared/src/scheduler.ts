/**
 * Repeating jobs are declared here, in code. The worker runs them on the `maintenance` queue
 * (one BullMQ job scheduler per entry), so every run also shows in Background jobs. A job
 * never runs twice at once. Phase 7 adds the screen with pause, resume and run now.
 */
export interface ScheduledJobDefinition {
  key: string;
  name: string;
  description: string;
  /** Five-field cron, in the organization's time zone where `inOrganizationTime` is set. */
  cron: string;
  inOrganizationTime?: boolean;
  /** Run once after the worker was off through a scheduled time. */
  catchUp?: boolean;
}

export const scheduledJobRegistry: readonly ScheduledJobDefinition[] = [
  {
    key: 'outbox-cleanup',
    name: 'Outbox cleanup',
    description: 'Removes published realtime events older than a day.',
    cron: '15 * * * *',
  },
  {
    key: 'retention-cleanup',
    name: 'Data retention cleanup',
    description: 'Removes old sign-in attempts, expired sessions and used tokens.',
    cron: '0 3 * * *',
    catchUp: true,
  },
  {
    key: 'two-factor-reminder',
    name: 'Two-step verification reminders',
    description:
      'Emails people who have not set up two-step verification on day 1, 7 and 30, once each.',
    cron: '0 7 * * *',
    inOrganizationTime: true,
    catchUp: true,
  },
];

export const scheduledJobKeys = scheduledJobRegistry.map((j) => j.key);
