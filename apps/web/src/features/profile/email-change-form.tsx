'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';

export function EmailChangeForm({ currentEmail }: { currentEmail: string }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const r = await api.post<{ message: string }>('/profile/email-change', {
        newEmail: email,
        password,
      });
      setMessage({ kind: 'ok', text: r.message });
      setEmail('');
      setPassword('');
    } catch (err) {
      setMessage({ kind: 'error', text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-4" noValidate>
      {message ? (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">
        Your email is {currentEmail}. A confirmation link goes to the new address; nothing changes
        until you open it.
      </p>
      <Field id="new-email" label="New email">
        <Input
          {...fieldA11y('new-email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </Field>
      <Field id="email-password" label="Your password">
        <Input
          {...fieldA11y('email-password')}
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoComplete="current-password"
        />
      </Field>
      <Button type="submit" variant="outline" disabled={busy || !email || !password}>
        {busy ? 'Sending…' : 'Send confirmation link'}
      </Button>
    </form>
  );
}
