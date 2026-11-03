import { describe, expect, it } from 'vitest';
import { overallStatus } from './health.js';

describe('overallStatus', () => {
  it('is ok when every check is ok', () => {
    expect(overallStatus([{ status: 'ok' }, { status: 'ok' }])).toBe('ok');
  });
  it('is degraded when one check is degraded and none is down', () => {
    expect(overallStatus([{ status: 'ok' }, { status: 'degraded' }])).toBe('degraded');
  });
  it('is down when any check is down', () => {
    expect(overallStatus([{ status: 'degraded' }, { status: 'down' }])).toBe('down');
  });
});
