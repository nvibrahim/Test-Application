export const OperationsActions = {
  jobRetried: 'jobs.job.retried',
  jobCancelled: 'jobs.job.cancelled',
  jobRemoved: 'jobs.job.removed',
  schedulePaused: 'jobs.schedule.paused',
  scheduleResumed: 'jobs.schedule.resumed',
  scheduleRunNow: 'jobs.schedule.run_now',
  auditExported: 'audit.log.exported',
  featureChanged: 'features.switch.changed',
} as const;
