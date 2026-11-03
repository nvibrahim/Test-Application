'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Role, UserDetail } from '@inspower/shared';
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
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';
import { useStepUp } from '@/features/two-factor/step-up-dialog';
import { AssignmentsEditor, type AssignmentDraft, type LocationOption } from './assignments-editor';

interface Activity {
  entries: { id: string; action: string; actorName: string | null; createdAt: string }[];
}

export function UserDetailView({
  user,
  roles,
  locations,
  activity,
  can,
  selfId,
}: {
  user: UserDetail;
  roles: Role[];
  locations: LocationOption[];
  activity: Activity;
  can: { manage: boolean; invite: boolean; superAdmin: boolean };
  selfId: string;
}) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const [fullName, setFullName] = useState(user.fullName);
  const [assignments, setAssignments] = useState<AssignmentDraft[]>(
    user.assignments
      .filter((a) => a.roleKey !== 'super_admin')
      .map((a) => ({ roleId: a.roleId, locationId: a.locationId })),
  );
  const [restricted, setRestricted] = useState<string[]>(user.locationIds);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [link, setLink] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const isSelf = user.id === selfId;
  const statusVariant =
    user.status === 'active' ? 'success' : user.status === 'invited' ? 'warning' : 'secondary';

  async function run(label: string, action: () => Promise<unknown>, confirm?: string) {
    if (confirm && !window.confirm(confirm)) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await withStepUp(action);
      if (r !== undefined) {
        setMessage({ kind: 'ok', text: label });
        router.refresh();
      }
    } catch (e) {
      setMessage({ kind: 'error', text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  }

  const changed =
    fullName !== user.fullName ||
    JSON.stringify(assignments) !==
      JSON.stringify(
        user.assignments
          .filter((a) => a.roleKey !== 'super_admin')
          .map((a) => ({ roleId: a.roleId, locationId: a.locationId })),
      ) ||
    JSON.stringify([...restricted].sort()) !== JSON.stringify([...user.locationIds].sort());

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href="/admin/users" className="text-sm text-muted-foreground hover:text-foreground">
            ← Users
          </Link>
          <h2 className="text-xl font-semibold">{user.fullName}</h2>
          <p className="text-sm text-muted-foreground">{user.email}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Badge variant={statusVariant}>{user.status}</Badge>
          {user.isSuperAdmin ? <Badge>Super Admin</Badge> : null}
          <Badge variant={user.twoFactorEnabled ? 'success' : 'secondary'}>
            {user.twoFactorEnabled ? '2FA on' : '2FA off'}
          </Badge>
        </div>
      </div>
      {message ? (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      {link ? (
        <Alert variant="success">
          <AlertDescription>
            New link (works once until it expires):{' '}
            <code className="break-all text-xs">{link}</code>
          </AlertDescription>
        </Alert>
      ) : null}

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Access</CardTitle>
            <CardDescription>
              Roles, each for every location or one of them. Permissions are the union.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Field id="full-name" label="Full name">
              <Input
                {...fieldA11y('full-name')}
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={!can.manage || user.status === 'anonymised'}
              />
            </Field>
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium">Roles</legend>
              <AssignmentsEditor
                value={assignments}
                onChange={setAssignments}
                roles={roles}
                locations={locations}
                disabled={!can.manage || user.status === 'anonymised'}
              />
            </fieldset>
            {locations.length > 1 ? (
              <fieldset className="space-y-2">
                <legend className="text-sm font-medium">Locations this person may see</legend>
                <p className="text-xs text-muted-foreground">
                  Nothing ticked means every location.
                </p>
                <div className="flex flex-wrap gap-3">
                  {locations.map((l) => (
                    <label key={l.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="size-5 accent-primary"
                        checked={restricted.includes(l.id)}
                        disabled={!can.manage}
                        onChange={(e) =>
                          setRestricted(
                            e.target.checked
                              ? [...restricted, l.id]
                              : restricted.filter((x) => x !== l.id),
                          )
                        }
                      />
                      {l.name}
                    </label>
                  ))}
                </div>
              </fieldset>
            ) : null}
            {can.manage && user.status !== 'anonymised' ? (
              <Button
                disabled={busy || !changed}
                onClick={() =>
                  run('Saved.', () =>
                    api.put(`/users/${user.id}`, {
                      fullName,
                      assignments,
                      locationIds: restricted,
                      version: user.version,
                    }),
                  )
                }
              >
                Save
              </Button>
            ) : null}
            {can.superAdmin && user.status === 'active' ? (
              <div className="rounded-md border p-3 text-sm">
                <div className="font-medium">Super Admin</div>
                <p className="mb-2 text-muted-foreground">
                  Every permission, now and in the future. Keep to two people.
                </p>
                {user.isSuperAdmin ? (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy || isSelf}
                    onClick={() =>
                      run(
                        'No longer a Super Admin.',
                        () => api.delete(`/users/${user.id}/super-admin`),
                        `Remove Super Admin from ${user.fullName}?`,
                      )
                    }
                  >
                    Remove Super Admin
                  </Button>
                ) : (
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={busy}
                    onClick={() =>
                      run(
                        'Now a Super Admin.',
                        () => api.post(`/users/${user.id}/super-admin`),
                        `Make ${user.fullName} a Super Admin?`,
                      )
                    }
                  >
                    Make Super Admin
                  </Button>
                )}
              </div>
            ) : null}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Account</CardTitle>
            <CardDescription>
              {user.status === 'invited' && user.invitation
                ? user.invitation.expired
                  ? `The invitation expired ${new Date(user.invitation.expiresAt).toLocaleString('en-GB')}.`
                  : `Invited; the link works until ${new Date(user.invitation.expiresAt).toLocaleString('en-GB')}.`
                : user.lastSignInAt
                  ? `Last sign-in ${new Date(user.lastSignInAt).toLocaleString('en-GB')}. ${user.activeSessions} active session${user.activeSessions === 1 ? '' : 's'}.`
                  : 'Never signed in.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {user.status === 'invited' && can.invite ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run('A new link was sent.', async () => {
                    const r = await api.post<{ link: string }>(
                      `/users/${user.id}/invitation/resend`,
                    );
                    setLink(r.link);
                    return r;
                  })
                }
              >
                Send a new link
              </Button>
            ) : null}
            {user.status === 'active' && can.manage && !isSelf ? (
              <Button
                variant="destructive"
                disabled={busy}
                onClick={() =>
                  run(
                    'Disabled and signed out everywhere.',
                    () => api.post(`/users/${user.id}/disable`),
                    `Disable ${user.fullName}? They are signed out everywhere at once.`,
                  )
                }
              >
                Disable
              </Button>
            ) : null}
            {user.status === 'disabled' && can.manage ? (
              <Button
                disabled={busy}
                onClick={() => run('Enabled.', () => api.post(`/users/${user.id}/enable`))}
              >
                Enable
              </Button>
            ) : null}
            {user.twoFactorEnabled && can.manage && !isSelf ? (
              <Button
                variant="outline"
                disabled={busy}
                onClick={() =>
                  run(
                    'Two-step verification was reset and the person emailed.',
                    () => api.post(`/users/${user.id}/two-factor/reset`),
                    `Remove two-step verification for ${user.fullName}?`,
                  )
                }
              >
                Reset 2FA
              </Button>
            ) : null}
            {user.status !== 'anonymised' && can.manage && !isSelf ? (
              <Button
                variant="ghost"
                disabled={busy}
                onClick={() =>
                  run(
                    'Anonymised.',
                    () => api.post(`/users/${user.id}/anonymise`),
                    `Anonymise ${user.fullName}? Their name and email are replaced for good; the audit history is kept.`,
                  )
                }
              >
                Anonymise
              </Button>
            ) : null}
          </CardContent>
        </Card>

        <Card className="xl:col-span-2">
          <CardHeader>
            <CardTitle>Recent activity</CardTitle>
            <CardDescription>
              What this person did, and what was done to their account.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {activity.entries.length ? (
              <ul className="divide-y text-sm">
                {activity.entries.map((e) => (
                  <li key={e.id} className="flex flex-wrap justify-between gap-2 py-2">
                    <span className="font-mono text-xs sm:text-sm">{e.action}</span>
                    <span className="text-muted-foreground">
                      {e.actorName ?? 'System'} · {new Date(e.createdAt).toLocaleString('en-GB')}
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-sm text-muted-foreground">Nothing yet.</p>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
