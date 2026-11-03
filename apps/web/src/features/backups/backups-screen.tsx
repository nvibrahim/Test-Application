'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import type { Backup, BackupStatusSummary, BackupTarget } from '@inspower/shared';
import { Alert, AlertDescription, AlertTitle } from '@inspower/ui/components/alert';
import { Badge } from '@inspower/ui/components/badge';
import { Button } from '@inspower/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import { useStepUp } from '@/features/two-factor/step-up-dialog';
import { api, messageOf } from '@/lib/api';
import { fetchDownload } from '@/lib/download';
import { RestoreDialog } from './restore-dialog';
import { TargetsCard } from './targets-card';

const when = (iso: string | null) => (iso ? new Date(iso).toLocaleString('en-GB') : 'Never');
const size = (bytes: number | null) =>
  bytes === null
    ? ''
    : bytes > 1_048_576
      ? `${(bytes / 1_048_576).toFixed(1)} MiB`
      : `${Math.max(1, Math.round(bytes / 1024))} KiB`;

function StatusCard({
  title,
  value,
  hint,
  tone,
}: {
  title: string;
  value: string;
  hint?: string;
  tone?: 'warning' | 'success';
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardDescription>{title}</CardDescription>
        <CardTitle className={tone === 'warning' ? 'text-destructive' : undefined}>
          {value}
        </CardTitle>
      </CardHeader>
      {hint ? <CardContent className="text-sm text-muted-foreground">{hint}</CardContent> : null}
    </Card>
  );
}

/**
 * Administration -> Backups: the three things that matter (last backup, last off-site copy, last
 * drill), the list, Back up now, Download and Verify, Restore for the Super Admin, and the
 * off-site targets. Everything refreshes live as the worker reports progress.
 */
export function BackupsScreen({
  backups,
  status,
  targets,
  canRun,
  canRestore,
}: {
  backups: Backup[];
  status: BackupStatusSummary;
  targets: BackupTarget[];
  canRun: boolean;
  canRestore: boolean;
}) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [restoring, setRestoring] = useState<Backup | null>(null);
  const running = backups.some((b) => b.status === 'running');

  // The worker's progress arrives live through the outbox; a slow poll covers a dropped socket.
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => router.refresh(), 10_000);
    return () => clearInterval(timer);
  }, [running, router]);

  async function act(label: string, run: () => Promise<unknown>) {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await withStepUp(run);
      if (result !== undefined) {
        setNotice(label);
        router.refresh();
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      {status.missed ? (
        <Alert variant="destructive">
          <AlertTitle>No backup in the last day</AlertTitle>
          <AlertDescription>
            The nightly backup did not complete. Check the background worker and the disk, then use
            Back up now.
          </AlertDescription>
        </Alert>
      ) : null}
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

      <div className="grid gap-4 md:grid-cols-3">
        <StatusCard
          title="Last backup"
          value={when(status.lastSuccessAt)}
          hint={`Kept in ${status.localDir}`}
          tone={status.missed ? 'warning' : undefined}
        />
        <StatusCard
          title="Last off-site copy"
          value={when(status.lastOffsiteAt)}
          hint={
            status.offsiteTarget
              ? `To ${status.offsiteTarget}`
              : 'No off-site target chosen in Settings → Backups'
          }
        />
        <StatusCard
          title="Last restore drill"
          value={when(status.lastDrillAt)}
          hint={
            status.lastDrillPassed === null
              ? 'Runs weekly; also from Verify on any backup'
              : status.lastDrillPassed
                ? 'Passed: the backup restored and the row counts matched'
                : 'Failed: see the notification and the audit log'
          }
          tone={status.lastDrillPassed === false ? 'warning' : undefined}
        />
      </div>

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div>
            <CardTitle>Backups</CardTitle>
            <CardDescription>
              Encrypted with key {status.keyFingerprint}. Keep that key with the owner of the
              backups, not with the backups.{' '}
              <Link className="underline" href="/admin/settings?section=backups">
                Schedule and retention
              </Link>
              .
            </CardDescription>
          </div>
          {canRun ? (
            <Button
              disabled={busy || running}
              onClick={() =>
                act('Backup queued. It appears below when the worker finishes.', () =>
                  api.post('/backups'),
                )
              }
            >
              {running ? 'Backing up…' : 'Back up now'}
            </Button>
          ) : null}
        </CardHeader>
        <CardContent>
          {backups.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No backups yet. The first nightly backup runs at the time in Settings → Backups.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-muted-foreground">
                  <tr>
                    <th className="py-2 pr-3 font-medium">Taken</th>
                    <th className="py-2 pr-3 font-medium">Kind</th>
                    <th className="py-2 pr-3 font-medium">Status</th>
                    <th className="py-2 pr-3 font-medium">Size</th>
                    <th className="py-2 pr-3 font-medium">Checks</th>
                    <th className="py-2 text-right font-medium">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {backups.map((b) => (
                    <tr key={b.id}>
                      <td className="py-2 pr-3">
                        <div>{when(b.finishedAt ?? b.startedAt)}</div>
                        {b.startedByName ? (
                          <div className="text-xs text-muted-foreground">By {b.startedByName}</div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 capitalize">{b.kind.replace('_', '-')}</td>
                      <td className="py-2 pr-3">
                        <Badge
                          variant={
                            b.status === 'completed'
                              ? 'success'
                              : b.status === 'failed'
                                ? 'destructive'
                                : 'secondary'
                          }
                        >
                          {b.status}
                        </Badge>
                        {b.error ? (
                          <div className="mt-1 max-w-xs text-xs text-destructive">{b.error}</div>
                        ) : null}
                      </td>
                      <td className="py-2 pr-3 tabular-nums">{size(b.sizeBytes)}</td>
                      <td className="py-2 pr-3 text-xs text-muted-foreground">
                        {b.restoreTestedAt ? (
                          <div>Drill passed {when(b.restoreTestedAt)}</div>
                        ) : null}
                        {b.offsiteCopiedAt ? <div>Off-site {when(b.offsiteCopiedAt)}</div> : null}
                        {b.offsiteError ? (
                          <div className="text-destructive">Off-site failed: {b.offsiteError}</div>
                        ) : null}
                        {b.migrationId ? <div>Schema {b.migrationId}</div> : null}
                      </td>
                      <td className="py-2 text-right">
                        {b.status === 'completed' && canRun ? (
                          <div className="flex flex-wrap justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                act('Download started.', () =>
                                  fetchDownload(`/api/v1/backups/${b.id}/download`),
                                )
                              }
                            >
                              Download
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              disabled={busy}
                              onClick={() =>
                                act(
                                  'Verification queued: the backup is restored into a scratch database and checked.',
                                  () => api.post(`/backups/${b.id}/verify`),
                                )
                              }
                            >
                              Verify
                            </Button>
                            {canRestore ? (
                              <Button
                                variant="destructive"
                                size="sm"
                                disabled={busy}
                                onClick={() => setRestoring(b)}
                              >
                                Restore…
                              </Button>
                            ) : null}
                          </div>
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

      <TargetsCard targets={targets} canManage={canRun} currentName={status.offsiteTarget} />

      <RestoreDialog
        backup={restoring}
        onClose={() => setRestoring(null)}
        onScheduled={() => {
          setRestoring(null);
          setNotice(
            'Restore scheduled. The app enters maintenance mode while the worker restores and swaps the database; administrators are told when it is done.',
          );
          router.refresh();
        }}
      />
    </div>
  );
}
