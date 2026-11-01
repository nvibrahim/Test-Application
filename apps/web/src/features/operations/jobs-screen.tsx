'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { JobsResponse, ScheduledJobView } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Badge } from '@inspower/ui/components/badge';
import { Button } from '@inspower/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import { cn } from '@inspower/ui/lib/utils';
import { api, messageOf } from '@/lib/api';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB') : '—');

function statusVariant(s: string) {
  return s === 'completed'
    ? 'success'
    : s === 'failed'
      ? 'destructive'
      : s === 'running'
        ? 'default'
        : 'secondary';
}

/** Administration → Jobs: live queue counts, the run history with retry/cancel/remove, and the scheduled jobs. */
export function JobsScreen({
  data,
  scheduled,
  filters,
  tab,
  canManage,
}: {
  data: JobsResponse;
  scheduled: ScheduledJobView[];
  filters: { queue: string; status: string };
  tab: 'queues' | 'scheduled';
  canManage: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function act(id: string, label: string, run: () => Promise<unknown>) {
    setBusy(id);
    setError(null);
    setNotice(null);
    try {
      await run();
      setNotice(label);
      router.refresh();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  const tabs = [
    { key: 'queues', label: 'Background jobs' },
    { key: 'scheduled', label: 'Scheduled jobs' },
  ] as const;

  return (
    <div className="space-y-6">
      <nav aria-label="Job views" className="flex gap-1 border-b">
        {tabs.map((t) => (
          <Link
            key={t.key}
            href={{ pathname: '/admin/jobs', query: { tab: t.key } }}
            aria-current={tab === t.key ? 'page' : undefined}
            className={cn(
              '-mb-px whitespace-nowrap border-b-2 px-3 py-2 text-sm font-medium',
              tab === t.key
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground',
            )}
          >
            {t.label}
          </Link>
        ))}
      </nav>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {notice ? (
        <Alert>
          <AlertDescription>{notice}</AlertDescription>
        </Alert>
      ) : null}

      {tab === 'queues' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            {data.queues.map((q) => (
              <Card key={q.name}>
                <CardHeader className="pb-2">
                  <CardDescription className="flex items-center justify-between">
                    <span className="capitalize">{q.name}</span>
                    {q.paused ? <Badge variant="warning">Paused</Badge> : null}
                  </CardDescription>
                  <CardTitle className="tabular-nums">
                    {q.active} running · {q.waiting + q.delayed} waiting
                  </CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground tabular-nums">
                  {q.completed} completed · {q.failed} failed
                </CardContent>
              </Card>
            ))}
          </div>

          <Card>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle>History</CardTitle>
                <CardDescription>
                  Every job the worker picked up, newest first.{' '}
                  {canManage ? (
                    <a
                      className="underline"
                      href="/api/v1/admin/queues"
                      target="_blank"
                      rel="noreferrer"
                    >
                      Open the queue inspector
                    </a>
                  ) : null}
                </CardDescription>
              </div>
              <form className="flex flex-wrap gap-2" method="get">
                <label className="sr-only" htmlFor="queue">
                  Queue
                </label>
                <select
                  id="queue"
                  name="queue"
                  defaultValue={filters.queue}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">All queues</option>
                  {data.queues.map((q) => (
                    <option key={q.name} value={q.name}>
                      {q.name}
                    </option>
                  ))}
                </select>
                <label className="sr-only" htmlFor="status">
                  Status
                </label>
                <select
                  id="status"
                  name="status"
                  defaultValue={filters.status}
                  className="h-9 rounded-md border bg-background px-2 text-sm"
                >
                  <option value="">Any status</option>
                  {['queued', 'running', 'completed', 'failed', 'cancelled'].map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <Button type="submit" variant="outline" size="sm">
                  Filter
                </Button>
              </form>
            </CardHeader>
            <CardContent>
              {data.runs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No jobs match.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="text-left text-muted-foreground">
                      <tr>
                        <th className="py-2 pr-3 font-medium">Queued</th>
                        <th className="py-2 pr-3 font-medium">Job</th>
                        <th className="py-2 pr-3 font-medium">Status</th>
                        <th className="py-2 pr-3 font-medium">Result</th>
                        <th className="py-2 text-right font-medium">
                          <span className="sr-only">Actions</span>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y">
                      {data.runs.map((r) => (
                        <tr key={r.id}>
                          <td className="py-2 pr-3 whitespace-nowrap">{when(r.queuedAt)}</td>
                          <td className="py-2 pr-3">
                            <div className="font-medium">
                              {r.queue} / {r.name}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              attempt {r.attempts}
                              {r.startedAt ? ` · started ${when(r.startedAt)}` : ''}
                            </div>
                          </td>
                          <td className="py-2 pr-3">
                            <Badge variant={statusVariant(r.status)}>{r.status}</Badge>
                          </td>
                          <td className="max-w-md py-2 pr-3 text-xs text-muted-foreground">
                            {r.error ? (
                              <span className="text-destructive">{r.error}</span>
                            ) : typeof r.result === 'string' ? (
                              r.result
                            ) : r.result ? (
                              JSON.stringify(r.result).slice(0, 160)
                            ) : (
                              ''
                            )}
                          </td>
                          <td className="py-2 text-right">
                            {canManage && r.live ? (
                              <div className="flex justify-end gap-1">
                                {r.status === 'failed' || r.status === 'completed' ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy === r.id}
                                    onClick={() =>
                                      act(r.id, 'Job queued again.', () =>
                                        api.post(`/jobs/${r.id}/retry`),
                                      )
                                    }
                                  >
                                    Retry
                                  </Button>
                                ) : null}
                                {r.status === 'queued' ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy === r.id}
                                    onClick={() =>
                                      act(r.id, 'Job cancelled.', () =>
                                        api.post(`/jobs/${r.id}/cancel`),
                                      )
                                    }
                                  >
                                    Cancel
                                  </Button>
                                ) : null}
                                {r.status !== 'running' ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    disabled={busy === r.id}
                                    onClick={() =>
                                      act(r.id, 'Job removed.', () => api.delete(`/jobs/${r.id}`))
                                    }
                                  >
                                    Remove
                                  </Button>
                                ) : null}
                              </div>
                            ) : canManage && r.status !== 'running' ? (
                              <Button
                                variant="ghost"
                                size="sm"
                                disabled={busy === r.id}
                                onClick={() =>
                                  act(r.id, 'History row removed.', () =>
                                    api.delete(`/jobs/${r.id}`),
                                  )
                                }
                              >
                                Remove
                              </Button>
                            ) : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle>Scheduled jobs</CardTitle>
            <CardDescription>
              Declared in code, run by the worker, never two at once. A paused job skips its slot;
              Run now runs it once either way.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="divide-y">
              {scheduled.map((j) => (
                <li
                  key={j.key}
                  className="flex flex-wrap items-start justify-between gap-3 py-3 text-sm"
                >
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2 font-medium">
                      {j.name}
                      {j.isPaused ? <Badge variant="warning">Paused</Badge> : null}
                      {j.lastError ? <Badge variant="destructive">Last run failed</Badge> : null}
                    </div>
                    <div className="text-muted-foreground">{j.description}</div>
                    <div className="mt-1 text-xs text-muted-foreground">
                      <code>{j.cron}</code> {j.timeZone}
                      {j.catchUp ? ' · catches up a missed run' : ''} · last {when(j.lastRunAt)} ·
                      next {when(j.nextRunAt)}
                    </div>
                    {j.lastError ? (
                      <div className="mt-1 text-xs text-destructive">{j.lastError}</div>
                    ) : j.lastResult ? (
                      <div className="mt-1 text-xs text-muted-foreground">{j.lastResult}</div>
                    ) : null}
                  </div>
                  {canManage ? (
                    <div className="flex gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={busy === j.key}
                        onClick={() =>
                          act(j.key, `${j.name} queued to run now.`, () =>
                            api.post(`/jobs/scheduled/${j.key}/run`),
                          )
                        }
                      >
                        Run now
                      </Button>
                      {j.isPaused ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === j.key}
                          onClick={() =>
                            act(j.key, `${j.name} resumed.`, () =>
                              api.post(`/jobs/scheduled/${j.key}/resume`),
                            )
                          }
                        >
                          Resume
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy === j.key}
                          onClick={() =>
                            act(j.key, `${j.name} paused.`, () =>
                              api.post(`/jobs/scheduled/${j.key}/pause`),
                            )
                          }
                        >
                          Pause
                        </Button>
                      )}
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
