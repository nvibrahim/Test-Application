'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';
import { PasswordField } from './password-field';

export function AcceptInvitationForm({
  token,
  email,
  fullName,
}: {
  token: string;
  email: string;
  fullName: string;
}) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirm) {
      setError('The two passwords differ.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await api.post('/invitations/accept', { token, password });
      setDone(true);
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="space-y-4">
        <Alert variant="success">
          <AlertDescription>
            Your account is ready. Sign in with your email and the password you just chose.
          </AlertDescription>
        </Alert>
        <Button asChild className="w-full">
          <Link href="/sign-in">Sign in</Link>
        </Button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <input type="hidden" name="username" autoComplete="username" value={email} readOnly />
      <PasswordField
        id="password"
        label="Choose a password"
        value={password}
        onChange={setPassword}
        email={email}
        fullName={fullName}
      />
      <Field id="confirm" label="Type it again">
        <Input
          {...fieldA11y('confirm')}
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      <Button type="submit" className="w-full" disabled={busy || !password}>
        {busy ? 'Saving…' : 'Create my account'}
      </Button>
    </form>
  );
}
