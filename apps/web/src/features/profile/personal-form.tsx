'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';

export function PersonalForm({ fullName, email }: { fullName: string; email: string }) {
  const router = useRouter();
  const [name, setName] = useState(fullName);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.put('/profile', { fullName: name });
      setMessage({ kind: 'ok', text: 'Saved.' });
      router.refresh();
    } catch (err) {
      setMessage({ kind: 'error', text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="max-w-md space-y-5" noValidate>
      {message ? (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      <Field id="fullName" label="Full name">
        <Input
          {...fieldA11y('fullName')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </Field>
      <Field id="email" label="Email" help="Change it from the card beside this one.">
        <Input {...fieldA11y('email')} value={email} readOnly disabled />
      </Field>
      <Button type="submit" disabled={busy || !name.trim() || name === fullName}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
