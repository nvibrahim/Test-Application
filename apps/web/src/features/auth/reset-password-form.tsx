'use client';

import Link from 'next/link';
import { useState } from 'react';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { api, messageOf } from '@/lib/api';
import { PasswordField } from './password-field';

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (password !== confirm) {
      setError('The two passwords differ.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/auth/reset-password', { token, newPassword: password });
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
            Your password was changed and every session was signed out.
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
      <PasswordField
        id="newPassword"
        label="New password"
        value={password}
        onChange={setPassword}
      />
      <div className="space-y-2">
        <label htmlFor="confirm" className="text-sm font-medium">
          Type it again
        </label>
        <input
          id="confirm"
          type="password"
          autoComplete="new-password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          className="flex min-h-11 w-full rounded-md border border-input bg-background px-3 py-2 text-base md:min-h-9 md:text-sm"
        />
      </div>
      <Button type="submit" className="w-full" disabled={busy || !password}>
        {busy ? 'Saving…' : 'Change password'}
      </Button>
    </form>
  );
}
