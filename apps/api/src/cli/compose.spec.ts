import { describe, expect, it } from 'vitest';
import { composeArgs, nextVersion, planRelease, versionPattern } from './compose';
import { orderDemoFirst } from './release';

const client = {
  slug: 'demo',
  root: '/srv/inspower',
  version: '2026.11.01-abc1234',
  image: 'ghcr.io/x/inspower',
};

describe('release planning', () => {
  it('versions as YYYY.MM.DD-sha', () => {
    const v = nextVersion(new Date('2026-11-01T10:00:00Z'), 'abc1234def');
    expect(v).toBe('2026.11.01-abc1234');
    expect(versionPattern.test(v)).toBe(true);
    expect(versionPattern.test('latest')).toBe(false);
  });

  it('backs up before migrating, migrates before restarting, checks health last, and can roll back', () => {
    const plan = planRelease(client);
    const titles = plan.steps.map((s) => s.title);
    expect(titles.indexOf('Pre-release backup')).toBeLessThan(
      titles.indexOf('Migrate the database'),
    );
    expect(titles.indexOf('Migrate the database')).toBeLessThan(
      titles.indexOf('Restart api, worker and web on the new version'),
    );
    expect(titles[titles.length - 1]).toBe('Health check');
    expect(plan.rollback.map((s) => s.title)).toEqual([
      'Roll back to the previous version',
      'Health check after rollback',
    ]);
    expect(composeArgs(client, ['ps'])).toEqual([
      'compose',
      '-p',
      'inspower-demo',
      '--env-file',
      '/srv/inspower/clients/demo/.env',
      '-f',
      '/srv/inspower/infra/compose/docker-compose.prod.yml',
      'ps',
    ]);
  });

  it('releases the demo client first', () => {
    expect(orderDemoFirst(['acme', 'demo', 'bravo'])).toEqual(['demo', 'acme', 'bravo']);
  });
});
