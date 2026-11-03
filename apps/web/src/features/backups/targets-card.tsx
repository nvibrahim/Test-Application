'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { BackupTarget } from '@inspower/shared';
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@inspower/ui/components/dialog';
import { Field } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { useStepUp } from '@/features/two-factor/step-up-dialog';
import { api, messageOf } from '@/lib/api';

const empty = {
  name: '',
  endpoint: '',
  region: 'auto',
  bucket: '',
  prefix: '',
  accessKeyId: '',
  secretAccessKey: '',
};

/** Off-site targets: any S3-compatible store. The secret is sealed on save and never shown again. */
export function TargetsCard({
  targets,
  canManage,
  currentName,
}: {
  targets: BackupTarget[];
  canManage: boolean;
  currentName: string | null;
}) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof empty) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await withStepUp(() =>
        api.post('/backups/targets', { ...form, endpoint: form.endpoint.trim() || null }),
      );
      if (r !== undefined) {
        setOpen(false);
        setForm(empty);
        router.refresh();
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function use(t: BackupTarget) {
    setError(null);
    try {
      const r = await withStepUp(() => api.put('/settings/backups', { offsiteTargetId: t.id }));
      if (r !== undefined) router.refresh();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  async function remove(t: BackupTarget) {
    if (
      !window.confirm(`Remove the target "${t.name}"? Copies already made there are not deleted.`)
    )
      return;
    setError(null);
    try {
      const r = await withStepUp(() => api.delete(`/backups/targets/${t.id}`));
      if (r !== undefined) router.refresh();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <Card>
      <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
        <div>
          <CardTitle>Off-site targets</CardTitle>
          <CardDescription>
            Each nightly file and its manifest are copied to the chosen store after the local write.
            Backblaze B2, Cloudflare R2, Wasabi, MinIO or AWS S3.
          </CardDescription>
        </div>
        {canManage ? (
          <Button variant="outline" onClick={() => setOpen(true)}>
            Add target
          </Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-3">
        {error && !open ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {targets.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No off-site target yet. Local backups alone do not survive a lost server.
          </p>
        ) : (
          <ul className="divide-y">
            {targets.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center justify-between gap-3 py-3 text-sm"
              >
                <div>
                  <div className="font-medium">
                    {t.name}{' '}
                    {currentName === t.name ? <Badge variant="success">In use</Badge> : null}
                  </div>
                  <div className="text-muted-foreground">
                    {t.config.bucket}
                    {t.config.prefix ? `/${t.config.prefix}` : ''} · {t.config.endpoint ?? 'AWS'} ·{' '}
                    {t.config.region}
                  </div>
                </div>
                {canManage ? (
                  <div className="flex gap-1">
                    {currentName !== t.name ? (
                      <Button variant="ghost" size="sm" onClick={() => use(t)}>
                        Use for off-site copies
                      </Button>
                    ) : null}
                    <Button variant="ghost" size="sm" onClick={() => remove(t)}>
                      Remove
                    </Button>
                  </div>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </CardContent>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="target-description">
          <form onSubmit={submit} className="space-y-4">
            <DialogHeader>
              <DialogTitle>Add an off-site target</DialogTitle>
              <DialogDescription id="target-description">
                The credentials are checked against the store before they are saved, then sealed.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field id="t-name" label="Name">
              <Input id="t-name" required value={form.name} onChange={set('name')} />
            </Field>
            <Field id="t-endpoint" label="Endpoint URL" help="Blank for AWS S3">
              <Input
                id="t-endpoint"
                type="url"
                value={form.endpoint}
                onChange={set('endpoint')}
                placeholder="https://s3.eu-central-003.backblazeb2.com"
              />
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="t-region" label="Region">
                <Input id="t-region" required value={form.region} onChange={set('region')} />
              </Field>
              <Field id="t-bucket" label="Bucket">
                <Input id="t-bucket" required value={form.bucket} onChange={set('bucket')} />
              </Field>
            </div>
            <Field id="t-prefix" label="Folder (prefix)">
              <Input id="t-prefix" value={form.prefix} onChange={set('prefix')} />
            </Field>
            <Field id="t-key" label="Access key id">
              <Input
                id="t-key"
                required
                autoComplete="off"
                value={form.accessKeyId}
                onChange={set('accessKeyId')}
              />
            </Field>
            <Field id="t-secret" label="Secret access key">
              <Input
                id="t-secret"
                required
                type="password"
                autoComplete="new-password"
                value={form.secretAccessKey}
                onChange={set('secretAccessKey')}
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy}>
                Save target
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
