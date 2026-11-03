/**
 * Grandfather-father-son retention. Given completed backups (newest first), keep the newest
 * `daily` days, the newest `weekly` Sunday-backups (one per week) and the newest `monthly`
 * first-backup-of-the-month (one per month). Manual and pre-release backups count like any
 * other; a backup that is the only one of its day is always "daily". Pure, so it is unit tested.
 */
export interface RetentionPolicy {
  daily: number;
  weekly: number;
  monthly: number;
}

export interface RetainableBackup {
  id: string;
  finishedAt: Date;
}

export function selectBackupsToKeep<T extends RetainableBackup>(
  backups: readonly T[],
  policy: RetentionPolicy,
): { keep: T[]; remove: T[] } {
  const sorted = [...backups].sort((a, b) => b.finishedAt.getTime() - a.finishedAt.getTime());
  const keep = new Set<string>();

  const dayKey = (d: Date) => d.toISOString().slice(0, 10);
  const weekKey = (d: Date) => {
    const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
    c.setUTCDate(c.getUTCDate() - c.getUTCDay()); // the Sunday that starts the week
    return c.toISOString().slice(0, 10);
  };
  const monthKey = (d: Date) => d.toISOString().slice(0, 7);

  // newest of each day
  const days = new Map<string, T>();
  for (const b of sorted) if (!days.has(dayKey(b.finishedAt))) days.set(dayKey(b.finishedAt), b);
  [...days.values()].slice(0, policy.daily).forEach((b) => keep.add(b.id));

  // newest of each week
  const weeks = new Map<string, T>();
  for (const b of sorted)
    if (!weeks.has(weekKey(b.finishedAt))) weeks.set(weekKey(b.finishedAt), b);
  [...weeks.values()].slice(0, policy.weekly).forEach((b) => keep.add(b.id));

  // oldest of each month (the first of the month survives longest)
  const months = new Map<string, T>();
  for (const b of [...sorted].reverse())
    if (!months.has(monthKey(b.finishedAt))) months.set(monthKey(b.finishedAt), b);
  [...months.values()]
    .reverse()
    .slice(0, policy.monthly)
    .forEach((b) => keep.add(b.id));

  return {
    keep: sorted.filter((b) => keep.has(b.id)),
    remove: sorted.filter((b) => !keep.has(b.id)),
  };
}

/** The nightly time from Settings as a cron pattern. */
export function nightlyCron(nightlyAt: string): string {
  const [h, m] = nightlyAt.split(':').map(Number);
  return `${m ?? 0} ${h ?? 2} * * *`;
}
