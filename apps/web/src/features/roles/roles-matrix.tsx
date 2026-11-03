'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Lock } from 'lucide-react';
import type { RolesResponse } from '@inspower/shared';
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
import { Select } from '@inspower/ui/components/select';
import { cn } from '@inspower/ui/lib/utils';
import { api, messageOf } from '@/lib/api';
import { useStepUp } from '@/features/two-factor/step-up-dialog';

/**
 * The permission matrix: roles as columns, permissions grouped by module as rows. The Super
 * Admin column reads "All" and cannot change; reserved rows are locked for every other role.
 * On phones one role is shown at a time. Saving a role asks for step-up.
 */
export function RolesMatrix({ data, canManage }: { data: RolesResponse; canManage: boolean }) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const fresh = () => Object.fromEntries(data.roles.map((r) => [r.id, new Set(r.permissions)]));
  const [draft, setDraft] = useState<Record<string, Set<string>>>(fresh);
  // Whenever the server sends new roles (after a save, reset, create or delete), the draft follows.
  const serverKey = data.roles.map((r) => `${r.id}:${r.version}`).join('|');
  const [seenKey, setSeenKey] = useState(serverKey);
  if (seenKey !== serverKey) {
    setSeenKey(serverKey);
    setDraft(fresh());
  }
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phoneRole, setPhoneRole] = useState(
    data.roles.find((r) => !r.isFixed)?.id ?? data.roles[0]?.id ?? '',
  );
  const [newOpen, setNewOpen] = useState(false);

  const dirty = useMemo(() => {
    const d = new Set<string>();
    for (const r of data.roles) {
      const now = draft[r.id] ?? new Set<string>();
      if (now.size !== r.permissions.length || r.permissions.some((p) => !now.has(p))) d.add(r.id);
    }
    return d;
  }, [data.roles, draft]);

  const byModule = useMemo(
    () =>
      data.modules.map((m) => ({
        ...m,
        permissions: data.permissions.filter((p) => p.module === m.key),
      })),
    [data],
  );

  function toggle(roleId: string, key: string) {
    setDraft((prev) => {
      const next = new Set(prev[roleId]);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return { ...prev, [roleId]: next };
    });
  }

  async function save(roleId: string) {
    const role = data.roles.find((r) => r.id === roleId)!;
    setBusy(roleId);
    setMessage(null);
    try {
      const r = await withStepUp(() =>
        api.put(`/roles/${roleId}`, {
          permissions: [...(draft[roleId] ?? [])],
          version: role.version,
        }),
      );
      if (r !== undefined) {
        setMessage({ kind: 'ok', text: `${role.name} saved.` });
        router.refresh();
      }
    } catch (e) {
      setMessage({ kind: 'error', text: messageOf(e) });
    } finally {
      setBusy(null);
    }
  }

  async function reset(roleId: string) {
    const role = data.roles.find((r) => r.id === roleId)!;
    if (!window.confirm(`Put ${role.name} back to its default permissions?`)) return;
    setBusy(roleId);
    try {
      const r = await withStepUp(() => api.post(`/roles/${roleId}/reset`));
      if (r !== undefined) {
        setMessage({ kind: 'ok', text: `${role.name} is back to its default.` });
        router.refresh();
      }
    } catch (e) {
      setMessage({ kind: 'error', text: messageOf(e) });
    } finally {
      setBusy(null);
    }
  }

  async function remove(roleId: string) {
    const role = data.roles.find((r) => r.id === roleId)!;
    if (!window.confirm(`Delete the role ${role.name}?`)) return;
    setBusy(roleId);
    try {
      const r = await withStepUp(() => api.delete(`/roles/${roleId}`));
      if (r !== undefined) {
        setMessage({ kind: 'ok', text: `${role.name} deleted.` });
        setPhoneRole(data.roles[1]?.id ?? '');
        router.refresh();
      }
    } catch (e) {
      setMessage({ kind: 'error', text: messageOf(e) });
    } finally {
      setBusy(null);
    }
  }

  const visibleRoles = (ids: string[]) => data.roles.filter((r) => ids.includes(r.id));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          {data.roles.length} roles, {data.permissions.length} permissions.{' '}
          <Lock className="inline size-3.5" aria-hidden="true" /> marks a permission reserved to the
          Super Admin.
        </p>
        {canManage ? <Button onClick={() => setNewOpen(true)}>New role</Button> : null}
      </div>
      {message ? (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}

      {/* Phone: one role at a time */}
      <div className="md:hidden">
        <Field id="phone-role" label="Role">
          <Select
            {...fieldA11y('phone-role')}
            value={phoneRole}
            onChange={(e) => setPhoneRole(e.target.value)}
          >
            {data.roles.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
        </Field>
        <div className="mt-4">
          <Matrix roles={visibleRoles([phoneRole])} />
        </div>
      </div>
      {/* Tablet and desktop: every role */}
      <div className="hidden md:block">
        <Matrix roles={data.roles} />
      </div>

      <NewRoleDialog
        open={newOpen}
        onOpenChange={setNewOpen}
        roles={data.roles}
        onCreated={() => router.refresh()}
      />
    </div>
  );

  function Matrix({ roles }: { roles: RolesResponse['roles'] }) {
    return (
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full text-sm">
          <thead className="bg-muted/50">
            <tr>
              <th className="sticky left-0 bg-muted/50 p-3 text-left font-medium">Permission</th>
              {roles.map((r) => (
                <th key={r.id} scope="col" className="p-3 text-center font-medium">
                  <div>{r.name}</div>
                  <div className="mt-1 flex flex-wrap justify-center gap-1 text-xs font-normal text-muted-foreground">
                    {r.memberCount} {r.memberCount === 1 ? 'person' : 'people'}
                    {r.isCustomised ? <Badge variant="warning">Customised</Badge> : null}
                    {r.isFixed ? <Badge variant="secondary">Fixed</Badge> : null}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {byModule.map((m) => (
              <ModuleRows key={m.key} module={m} roles={roles} />
            ))}
          </tbody>
          {canManage ? (
            <tfoot>
              <tr className="border-t bg-muted/30">
                <td className="sticky left-0 bg-muted/30 p-3 text-xs text-muted-foreground">
                  Changes are saved per role and ask for step-up.
                </td>
                {roles.map((r) => (
                  <td key={r.id} className="p-3 text-center">
                    {r.isFixed ? (
                      <span className="text-xs text-muted-foreground">Cannot change</span>
                    ) : (
                      <div className="flex flex-col items-center gap-1">
                        <Button
                          size="sm"
                          disabled={!dirty.has(r.id) || busy !== null}
                          onClick={() => save(r.id)}
                        >
                          {busy === r.id ? 'Saving…' : 'Save'}
                        </Button>
                        {r.isSystem ? (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null}
                            onClick={() => reset(r.id)}
                          >
                            Reset to default
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            disabled={busy !== null || r.memberCount > 0}
                            onClick={() => remove(r.id)}
                            title={r.memberCount > 0 ? 'Move its members first' : undefined}
                          >
                            Delete
                          </Button>
                        )}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            </tfoot>
          ) : null}
        </table>
      </div>
    );
  }

  function ModuleRows({
    module: m,
    roles,
  }: {
    module: (typeof byModule)[number];
    roles: RolesResponse['roles'];
  }) {
    return (
      <>
        <tr className="border-t bg-muted/20">
          <th
            colSpan={roles.length + 1}
            scope="rowgroup"
            className="sticky left-0 p-2 pl-3 text-left text-xs font-semibold uppercase tracking-wide text-muted-foreground"
          >
            {m.label}
          </th>
        </tr>
        {m.permissions.map((p) => (
          <tr key={p.key} className="border-t">
            <th scope="row" className="sticky left-0 bg-background p-3 text-left font-normal">
              <div className="flex items-center gap-2 font-medium">
                {p.label}
                {p.superAdminOnly ? (
                  <Lock
                    className="size-3.5 text-muted-foreground"
                    aria-label="Reserved to the Super Admin"
                  />
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground">{p.description}</div>
            </th>
            {roles.map((r) => {
              const checked = r.isFixed ? true : (draft[r.id]?.has(p.key) ?? false);
              const disabled = !canManage || r.isFixed || p.superAdminOnly;
              return (
                <td key={r.id} className={cn('p-3 text-center', r.isFixed && 'text-success')}>
                  {r.isFixed ? (
                    <span aria-label={`${r.name}: ${p.label}: always`}>All</span>
                  ) : (
                    <input
                      type="checkbox"
                      className="size-5 accent-primary disabled:opacity-40"
                      aria-label={`${r.name}: ${p.label}`}
                      checked={checked}
                      disabled={disabled}
                      onChange={() => toggle(r.id, p.key)}
                    />
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </>
    );
  }
}

function NewRoleDialog({
  open,
  onOpenChange,
  roles,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  roles: RolesResponse['roles'];
  onCreated: () => void;
}) {
  const withStepUp = useStepUp();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [copyFrom, setCopyFrom] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const r = await withStepUp(() =>
        api.post('/roles', {
          name,
          description: description || undefined,
          permissions: [],
          copyFromRoleId: copyFrom || undefined,
        }),
      );
      if (r !== undefined) {
        onOpenChange(false);
        setName('');
        setDescription('');
        setCopyFrom('');
        onCreated();
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby="new-role-description">
        <form onSubmit={submit} className="space-y-4" noValidate>
          <DialogHeader>
            <DialogTitle>New role</DialogTitle>
            <DialogDescription id="new-role-description">
              Start from another role&apos;s permissions, then tick what else it may do in the
              matrix.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}
          <Field id="role-name" label="Name">
            <Input
              {...fieldA11y('role-name')}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              maxLength={60}
            />
          </Field>
          <Field
            id="role-description"
            label="Description"
            help="Optional. Shown on the Users page when choosing a role."
          >
            <Input
              {...fieldA11y('role-description')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={300}
            />
          </Field>
          <Field id="role-copy" label="Start from">
            <Select
              {...fieldA11y('role-copy')}
              value={copyFrom}
              onChange={(e) => setCopyFrom(e.target.value)}
            >
              <option value="">No permissions</option>
              {roles
                .filter((r) => !r.isFixed)
                .map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.name}
                  </option>
                ))}
            </Select>
          </Field>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={busy || name.trim().length < 2}>
              {busy ? 'Creating…' : 'Create role'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
