'use client';

import { useState } from 'react';
import type { Backup } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
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

/** Restore needs the reserved permission, step-up, and the word RESTORE typed. Says the date twice. */
export function RestoreDialog({
  backup,
  onClose,
  onScheduled,
}: {
  backup: Backup | null;
  onClose: () => void;
  onScheduled: () => void;
}) {
  const withStepUp = useStepUp();
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const taken = backup
    ? new Date(backup.finishedAt ?? backup.startedAt).toLocaleString('en-GB')
    : '';

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!backup) return;
    setBusy(true);
    setError(null);
    try {
      const r = await withStepUp(() => api.post(`/backups/${backup.id}/restore`, { confirmation }));
      if (r !== undefined) {
        setConfirmation('');
        onScheduled();
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={!!backup} onOpenChange={(o) => (!o ? onClose() : undefined)}>
      <DialogContent aria-describedby="restore-description">
        <form onSubmit={submit} className="space-y-4">
          <DialogHeader>
            <DialogTitle>Restore the backup from {taken}?</DialogTitle>
            <DialogDescription id="restore-description">
              Everything entered since {taken} will be lost. The app goes into maintenance mode, the
              database is replaced from this backup, and administrators are notified when it is
              done. The current database is kept on the server as a copy.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field id="restore-confirmation" label="Type RESTORE to continue">
            <Input
              id="restore-confirmation"
              value={confirmation}
              onChange={(e) => setConfirmation(e.target.value)}
              autoComplete="off"
              spellCheck={false}
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="destructive"
              disabled={busy || confirmation !== 'RESTORE'}
            >
              Restore now
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
