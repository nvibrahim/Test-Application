'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useStepUp } from '@/features/two-factor/step-up-dialog';
import { fetchDownload } from '@/lib/download';
import { messageOf } from '@/lib/api';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import type { AuditLogEntry, AuditLogResponse } from '@inspower/shared';
import { Button } from '@inspower/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@inspower/ui/components/dialog';
import { Input } from '@inspower/ui/components/input';
import { Label } from '@inspower/ui/components/label';

type Filters = {
  action?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  from?: string;
  to?: string;
  cursor?: string;
};

/** Administration → Audit log: filters, the table, a before/after drawer, CSV export (step-up on the API). */
export function AuditScreen({
  data,
  filters,
  canExport,
}: {
  data: AuditLogResponse;
  filters: Filters;
  canExport: boolean;
}) {
  const [open, setOpen] = useState<AuditLogEntry | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const withStepUp = useStepUp();

  async function exportCsv() {
    setExporting(true);
    setError(null);
    try {
      await withStepUp(() => fetchDownload(`/api/v1/audit/export.csv?${exportQuery.toString()}`));
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setExporting(false);
    }
  }
  const exportQuery = new URLSearchParams();
  for (const k of ['action', 'entityType', 'entityId', 'actorId'] as const)
    if (filters[k]) exportQuery.set(k, filters[k]!);
  if (filters.from) exportQuery.set('from', new Date(filters.from).toISOString());
  if (filters.to) exportQuery.set('to', new Date(`${filters.to}T23:59:59.999Z`).toISOString());
  const nextQuery = { ...filters, cursor: data.nextCursor ?? undefined };

  return (
    <div className="space-y-6">
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Card>
        <CardHeader>
          <CardTitle>Filter</CardTitle>
          <CardDescription>
            Rows can never be changed or deleted. An export is itself written to the log.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form method="get" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <div className="space-y-1">
              <Label htmlFor="action">Action</Label>
              <Input
                id="action"
                name="action"
                list="actions"
                defaultValue={filters.action ?? ''}
                placeholder="users. or users.user.invited"
              />
              <datalist id="actions">
                {data.actions.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="entityType">Entity type</Label>
              <Input
                id="entityType"
                name="entityType"
                list="entity-types"
                defaultValue={filters.entityType ?? ''}
              />
              <datalist id="entity-types">
                {data.entityTypes.map((a) => (
                  <option key={a} value={a} />
                ))}
              </datalist>
            </div>
            <div className="space-y-1">
              <Label htmlFor="entityId">Entity id</Label>
              <Input id="entityId" name="entityId" defaultValue={filters.entityId ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="actorId">Actor id</Label>
              <Input id="actorId" name="actorId" defaultValue={filters.actorId ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="from">From</Label>
              <Input id="from" name="from" type="date" defaultValue={filters.from ?? ''} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="to">To</Label>
              <Input id="to" name="to" type="date" defaultValue={filters.to ?? ''} />
            </div>
            <div className="flex flex-wrap gap-2 sm:col-span-2 lg:col-span-6">
              <Button type="submit">Apply</Button>
              <Button asChild variant="outline">
                <Link href="/admin/audit">Clear</Link>
              </Button>
              {canExport ? (
                <Button type="button" variant="outline" disabled={exporting} onClick={exportCsv}>
                  {exporting ? 'Exporting…' : 'Export CSV'}
                </Button>
              ) : null}
            </div>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-6">
          {data.entries.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nothing matches.</p>
          ) : (
            <>
              {/* Phone: one card per entry */}
              <ul className="divide-y md:hidden">
                {data.entries.map((e) => (
                  <li key={e.id} className="flex items-start justify-between gap-3 py-3 text-sm">
                    <div className="min-w-0">
                      <code className="block truncate text-xs">{e.action}</code>
                      <div className="text-muted-foreground">
                        {new Date(e.createdAt).toLocaleString('en-GB')} ·{' '}
                        {e.actorName ?? (e.actorId ? 'Former user' : 'System')}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {e.entityType}
                        {e.entityId ? ` ${e.entityId.slice(0, 8)}…` : ''}
                      </div>
                    </div>
                    <Button variant="ghost" size="sm" onClick={() => setOpen(e)}>
                      Details
                    </Button>
                  </li>
                ))}
              </ul>
              {/* Tablet and up: the table */}
              <div className="hidden overflow-x-auto md:block">
                <table className="w-full text-sm">
                  <thead className="text-left text-muted-foreground">
                    <tr>
                      <th className="py-2 pr-3 font-medium">When</th>
                      <th className="py-2 pr-3 font-medium">Action</th>
                      <th className="py-2 pr-3 font-medium">Who</th>
                      <th className="py-2 pr-3 font-medium">Entity</th>
                      <th className="py-2 text-right font-medium">
                        <span className="sr-only">Details</span>
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.entries.map((e) => (
                      <tr key={e.id}>
                        <td className="py-2 pr-3 whitespace-nowrap">
                          {new Date(e.createdAt).toLocaleString('en-GB')}
                        </td>
                        <td className="py-2 pr-3">
                          <code className="text-xs">{e.action}</code>
                        </td>
                        <td className="py-2 pr-3">
                          {e.actorName ?? (e.actorId ? 'Former user' : 'System')}
                        </td>
                        <td className="py-2 pr-3 text-muted-foreground">
                          {e.entityType}
                          {e.entityId ? (
                            <span className="text-xs"> {e.entityId.slice(0, 8)}…</span>
                          ) : null}
                        </td>
                        <td className="py-2 text-right">
                          <Button variant="ghost" size="sm" onClick={() => setOpen(e)}>
                            Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
          {data.nextCursor ? (
            <div className="mt-4 flex justify-end">
              <Button asChild variant="outline">
                <Link href={{ pathname: '/admin/audit', query: nextQuery }}>Older entries</Link>
              </Button>
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Dialog open={!!open} onOpenChange={(o) => (!o ? setOpen(null) : undefined)}>
        <DialogContent aria-describedby="audit-entry-description" className="max-w-2xl">
          {open ? (
            <>
              <DialogHeader>
                <DialogTitle>
                  <code>{open.action}</code>
                </DialogTitle>
                <DialogDescription id="audit-entry-description">
                  {new Date(open.createdAt).toLocaleString('en-GB')} · {open.actorName ?? 'System'}
                  {open.ip ? ` · ${open.ip}` : ''}
                </DialogDescription>
              </DialogHeader>
              <dl className="grid grid-cols-[8rem_1fr] gap-y-2 text-sm">
                <dt className="text-muted-foreground">Entity</dt>
                <dd>
                  {open.entityType} {open.entityId ?? ''}
                </dd>
                <dt className="text-muted-foreground">Actor id</dt>
                <dd className="break-all">{open.actorId ?? '—'}</dd>
                <dt className="text-muted-foreground">Browser</dt>
                <dd className="break-all">{open.userAgent ?? '—'}</dd>
              </dl>
              <div>
                <div className="mb-1 text-sm font-medium">Changes</div>
                <pre className="max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs">
                  {open.changes ? JSON.stringify(open.changes, null, 2) : 'None recorded'}
                </pre>
              </div>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </div>
  );
}
