'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { inviteResponseSchema, type Role } from '@inspower/shared';
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
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';
import { useStepUp } from '@/features/two-factor/step-up-dialog';
import { AssignmentsEditor, type AssignmentDraft, type LocationOption } from './assignments-editor';

export function InviteDialog({ roles, locations }: { roles: Role[]; locations: LocationOption[] }) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const defaultRole = roles.find((r) => r.key === 'member') ?? roles.find((r) => !r.isFixed);
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [fullName, setFullName] = useState('');
  const [assignments, setAssignments] = useState<AssignmentDraft[]>([
    { roleId: defaultRole?.id ?? '', locationId: null },
  ]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ link: string; expiresAt: string; name: string } | null>(
    null,
  );
  const [copied, setCopied] = useState(false);

  function reset() {
    setEmail('');
    setFullName('');
    setAssignments([{ roleId: defaultRole?.id ?? '', locationId: null }]);
    setError(null);
    setResult(null);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await withStepUp(() =>
        api.post('/users', { email, fullName, assignments, locationIds: [] }, inviteResponseSchema),
      );
      if (r) {
        setResult({ link: r.link, expiresAt: r.expiresAt, name: r.user.fullName });
        router.refresh();
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <Button
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        Invite user
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent aria-describedby="invite-description">
          {result ? (
            <div className="space-y-4">
              <DialogHeader>
                <DialogTitle>Invitation sent</DialogTitle>
                <DialogDescription id="invite-description">
                  {result.name} has been emailed a link that works once until{' '}
                  {new Date(result.expiresAt).toLocaleString('en-GB')}. You can also hand it over
                  yourself:
                </DialogDescription>
              </DialogHeader>
              <code
                className="block break-all rounded-md border bg-muted/40 p-2 text-xs"
                data-testid="invite-link"
              >
                {result.link}
              </code>
              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() =>
                    navigator.clipboard?.writeText(result.link).then(() => setCopied(true))
                  }
                >
                  {copied ? 'Copied' : 'Copy link'}
                </Button>
                <Button type="button" onClick={() => setOpen(false)}>
                  Done
                </Button>
              </DialogFooter>
            </div>
          ) : (
            <form onSubmit={submit} className="space-y-4" noValidate>
              <DialogHeader>
                <DialogTitle>Invite a person</DialogTitle>
                <DialogDescription id="invite-description">
                  They get a link to choose their password. Roles can be limited to a location.
                </DialogDescription>
              </DialogHeader>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Field id="invite-name" label="Full name">
                <Input
                  {...fieldA11y('invite-name')}
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoFocus
                  autoComplete="off"
                />
              </Field>
              <Field id="invite-email" label="Email">
                <Input
                  {...fieldA11y('invite-email')}
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="off"
                />
              </Field>
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Roles</legend>
                <AssignmentsEditor
                  value={assignments}
                  onChange={setAssignments}
                  roles={roles}
                  locations={locations}
                />
              </fieldset>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={busy || !email || !fullName.trim() || !assignments.length}
                >
                  {busy ? 'Sending…' : 'Send invitation'}
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
