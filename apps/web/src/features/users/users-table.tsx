'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { UserListItem } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Badge } from '@inspower/ui/components/badge';
import { Button } from '@inspower/ui/components/button';
import { api, messageOf } from '@/lib/api';
import { useStepUp } from '@/features/two-factor/step-up-dialog';

export function UsersTable({
  users,
  canManage,
  selfId,
}: {
  users: UserListItem[];
  canManage: boolean;
  selfId: string;
}) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function reset(u: UserListItem) {
    if (
      !window.confirm(
        `Remove two-step verification for ${u.fullName}? They will be signed out everywhere and emailed.`,
      )
    )
      return;
    setBusy(u.id);
    setMessage(null);
    try {
      const r = await withStepUp(() => api.post(`/users/${u.id}/two-factor/reset`));
      if (r !== undefined)
        setMessage({ kind: 'ok', text: `Two-step verification was reset for ${u.fullName}.` });
      router.refresh();
    } catch (e) {
      setMessage({ kind: 'error', text: messageOf(e) });
    } finally {
      setBusy(null);
    }
  }
  async function remind(u: UserListItem) {
    setBusy(u.id);
    setMessage(null);
    try {
      await api.post(`/users/${u.id}/two-factor/remind`);
      setMessage({ kind: 'ok', text: `A reminder was emailed to ${u.fullName}.` });
    } catch (e) {
      setMessage({ kind: 'error', text: messageOf(e) });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      {/* Phones: cards. Tablets and desktops: a table. */}
      <ul className="space-y-3 md:hidden">
        {users.map((u) => (
          <li key={u.id} className="rounded-lg border p-4 text-sm">
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link
                  href={`/admin/users/${u.id}` as never}
                  className="font-medium hover:underline"
                >
                  {u.fullName}
                </Link>
                <div className="text-muted-foreground">{u.email}</div>
              </div>
              <Badge variant={u.twoFactorEnabled ? 'success' : 'secondary'}>
                {u.twoFactorEnabled ? '2FA on' : '2FA off'}
              </Badge>
            </div>
            <div className="mt-2 text-muted-foreground">
              {u.roles.join(', ') || 'No role'} ·{' '}
              {u.lastSignInAt
                ? `last sign-in ${new Date(u.lastSignInAt).toLocaleDateString('en-GB')}`
                : 'never signed in'}
            </div>
            {canManage ? <Actions u={u} /> : null}
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto rounded-lg border md:block">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 text-left">
            <tr>
              <th className="p-3 font-medium">Name</th>
              <th className="p-3 font-medium">Email</th>
              <th className="p-3 font-medium">Status</th>
              <th className="p-3 font-medium">Roles</th>
              <th className="p-3 font-medium">Two-step</th>
              <th className="p-3 font-medium">Last sign-in</th>
              {canManage ? <th className="p-3 font-medium">Actions</th> : null}
            </tr>
          </thead>
          <tbody className="divide-y">
            {users.map((u) => (
              <tr key={u.id}>
                <td className="p-3 font-medium">
                  <Link href={`/admin/users/${u.id}` as never} className="hover:underline">
                    {u.fullName}
                  </Link>
                </td>
                <td className="p-3 text-muted-foreground">{u.email}</td>
                <td className="p-3">
                  <Badge
                    variant={
                      u.status === 'active'
                        ? 'success'
                        : u.status === 'invited'
                          ? 'warning'
                          : 'secondary'
                    }
                  >
                    {u.status}
                  </Badge>
                </td>
                <td className="p-3">{u.roles.join(', ') || '—'}</td>
                <td className="p-3">
                  <Badge variant={u.twoFactorEnabled ? 'success' : 'secondary'}>
                    {u.twoFactorEnabled ? 'On' : 'Off'}
                  </Badge>
                </td>
                <td className="p-3 text-muted-foreground">
                  {u.lastSignInAt ? new Date(u.lastSignInAt).toLocaleString('en-GB') : 'Never'}
                </td>
                {canManage ? (
                  <td className="p-3">
                    <Actions u={u} />
                  </td>
                ) : null}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  function Actions({ u }: { u: UserListItem }) {
    return (
      <div className="mt-2 flex flex-wrap gap-2 md:mt-0">
        {u.twoFactorEnabled ? (
          <Button
            size="sm"
            variant="outline"
            disabled={busy !== null || u.id === selfId}
            onClick={() => reset(u)}
            title={u.id === selfId ? 'Turn yours off from Profile → Security' : undefined}
          >
            Reset 2FA
          </Button>
        ) : (
          <Button size="sm" variant="outline" disabled={busy !== null} onClick={() => remind(u)}>
            Send reminder
          </Button>
        )}
      </div>
    );
  }
}
