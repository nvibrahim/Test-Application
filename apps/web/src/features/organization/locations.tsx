'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Location } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Badge } from '@inspower/ui/components/badge';
import { Button } from '@inspower/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@inspower/ui/components/dialog';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';

export function LocationsList({
  locations,
  canManage,
}: {
  locations: Location[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState<Location | 'new' | null>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  function open(l: Location | 'new') {
    setEditing(l);
    setName(l === 'new' ? '' : l.name);
    setAddress(l === 'new' ? '' : l.addressLines.join('\n'));
    setError(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const addressLines = address
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
      if (editing === 'new') await api.post('/locations', { name, addressLines });
      else if (editing)
        await api.put(`/locations/${editing.id}`, { name, addressLines, version: editing.version });
      setEditing(null);
      router.refresh();
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(l: Location) {
    setError(null);
    try {
      await api.put(`/locations/${l.id}`, { isActive: !l.isActive, version: l.version });
      router.refresh();
    } catch (err) {
      setError(messageOf(err));
    }
  }

  return (
    <div className="space-y-4">
      {error && !editing ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <div className="flex justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {locations.length} location{locations.length === 1 ? '' : 's'}. Locations are never
          deleted, only made inactive.
        </p>
        {canManage ? <Button onClick={() => open('new')}>Add location</Button> : null}
      </div>
      <ul className="divide-y rounded-lg border">
        {locations.map((l) => (
          <li key={l.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <div className="flex items-center gap-2 font-medium">
                {l.name}
                {l.isHeadOffice ? <Badge variant="secondary">Head office</Badge> : null}
                {!l.isActive ? <Badge variant="outline">Inactive</Badge> : null}
              </div>
              <div className="text-muted-foreground">
                {l.addressLines.join(', ') || 'No address'}
                {l.managerName ? ` · managed by ${l.managerName}` : ''}
              </div>
            </div>
            {canManage ? (
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => open(l)}>
                  Edit
                </Button>
                {!l.isHeadOffice ? (
                  <Button size="sm" variant="ghost" onClick={() => toggleActive(l)}>
                    {l.isActive ? 'Make inactive' : 'Make active'}
                  </Button>
                ) : null}
              </div>
            ) : null}
          </li>
        ))}
      </ul>
      <Dialog open={editing !== null} onOpenChange={(o) => (!o ? setEditing(null) : undefined)}>
        <DialogContent aria-describedby="location-description">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>{editing === 'new' ? 'Add a location' : 'Edit location'}</DialogTitle>
              <DialogDescription id="location-description">
                A branch, clinic or office. People and roles can be limited to it.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field id="loc-name" label="Name">
              <Input
                {...fieldA11y('loc-name')}
                value={name}
                onChange={(e) => setName(e.target.value)}
                autoFocus
              />
            </Field>
            <Field id="loc-address" label="Address" help="One line per row.">
              <textarea
                id="loc-address"
                rows={3}
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm md:text-sm"
              />
            </Field>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !name.trim()}>
                {busy ? 'Saving…' : 'Save'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
