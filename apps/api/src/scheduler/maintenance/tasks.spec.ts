import { allScheduledJobs } from '@inspower/shared';
import { describe, expect, it } from 'vitest';
import { maintenanceTasks } from './index';

describe('scheduled jobs', () => {
  it('every entry in the shared registry has a task, and no task is unregistered', () => {
    const keys = allScheduledJobs.map((j) => j.key).sort();
    expect(Object.keys(maintenanceTasks).sort()).toEqual(keys);
  });
});
