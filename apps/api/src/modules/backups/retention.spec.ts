import { describe, expect, it } from 'vitest';
import { nightlyCron, selectBackupsToKeep } from './retention';

function daily(from: string, days: number) {
  const start = new Date(from);
  return Array.from({ length: days }, (_, i) => ({
    id: `b${i}`,
    finishedAt: new Date(start.getTime() - i * 86_400_000),
  }));
}

describe('backup retention', () => {
  it('keeps 14 daily, 8 weekly and 12 monthly over a year of nightly backups', () => {
    const all = daily('2026-11-01T02:00:00Z', 400);
    const { keep, remove } = selectBackupsToKeep(all, { daily: 14, weekly: 8, monthly: 12 });
    expect(keep.length + remove.length).toBe(400);
    // the newest fourteen are all kept
    for (let i = 0; i < 14; i += 1) expect(keep.map((b) => b.id)).toContain(`b${i}`);
    // one per month for twelve months, one per week for eight weeks, no more than 14+8+12
    expect(keep.length).toBeLessThanOrEqual(34);
    expect(keep.length).toBeGreaterThanOrEqual(26);
    const months = new Set(keep.map((b) => b.finishedAt.toISOString().slice(0, 7)));
    expect(months.size).toBeGreaterThanOrEqual(12);
  });

  it('keeps everything while there is less than the daily count', () => {
    const { remove } = selectBackupsToKeep(daily('2026-11-01T02:00:00Z', 5), {
      daily: 14,
      weekly: 8,
      monthly: 12,
    });
    expect(remove).toHaveLength(0);
  });

  it('keeps the newest of a day with several backups', () => {
    const a = { id: 'late', finishedAt: new Date('2026-11-01T10:00:00Z') };
    const b = { id: 'early', finishedAt: new Date('2026-11-01T02:00:00Z') };
    const { keep } = selectBackupsToKeep([b, a], { daily: 1, weekly: 0, monthly: 0 });
    expect(keep.map((k) => k.id)).toEqual(['late']);
  });

  it('turns the nightly time into a cron pattern', () => {
    expect(nightlyCron('02:00')).toBe('0 2 * * *');
    expect(nightlyCron('23:45')).toBe('45 23 * * *');
  });
});
