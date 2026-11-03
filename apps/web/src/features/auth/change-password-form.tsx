'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';
import { PasswordField } from './password-field';

/** Used on the forced change-password screen and in Profile -> Security. */
export function ChangePasswordForm({
  email,
  fullName,
  forced = false,
}: {
  email: string;
  fullName: string;
  forced?: boolean;
}) {
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) {
      setError('The two new passwords differ.');
      return;
    }
    setBusy(true);
    try {
      const r = await api.post<{ next: string }>('/auth/password/change', {
        currentPassword: current,
        newPassword: next,
      });
      if (forced) {
        router.push(r.next);
        router.refresh();
      } else {
        setDone(true);
        setCurrent('');
        setNext('');
        setConfirm('');
        router.refresh();
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {done ? (
        <Alert variant="success">
          <AlertDescription>
            Your password was changed. Every other session was signed out.
          </AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      <Field id="currentPassword" label={forced ? 'Temporary password' : 'Current password'}>
        <Input
          {...fieldA11y('currentPassword')}
          type="password"
          autoComplete="current-password"
          value={current}
          onChange={(e) => setCurrent(e.target.value)}
          autoFocus={forced}
        />
      </Field>
      <PasswordField
        id="newPassword"
        label="New password"
        value={next}
        onChange={setNext}
        email={email}
        fullName={fullName}
      />
      <Field id="confirmPassword" label="Type the new password again">
        <Input
          {...fieldA11y('confirmPassword')}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" className={forced ? 'w-full' : ''} disabled={busy || !current || !next}>
        {busy ? 'Saving…' : forced ? 'Set my password' : 'Change password'}
      </Button>
    </form>
  );
}
