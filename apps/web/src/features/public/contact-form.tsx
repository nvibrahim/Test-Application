'use client';

import { useState } from 'react';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';

export function ContactForm() {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [openedAt] = useState(() => Date.now());
  const [state, setState] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setState(null);
    try {
      const form = new FormData(e.currentTarget as HTMLFormElement);
      const r = await api.post<{ message: string }>('/public/contact', {
        name,
        email,
        message,
        openedAt,
        company_website: String(form.get('company_website') ?? ''),
      });
      setState({ kind: 'ok', text: r.message });
      setName('');
      setEmail('');
      setMessage('');
    } catch (err) {
      setState({ kind: 'error', text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-4" noValidate>
      {state ? (
        <Alert variant={state.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{state.text}</AlertDescription>
        </Alert>
      ) : null}
      <Field id="c-name" label="Your name">
        <Input
          {...fieldA11y('c-name')}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="name"
        />
      </Field>
      <Field id="c-email" label="Your email">
        <Input
          {...fieldA11y('c-email')}
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          autoComplete="email"
        />
      </Field>
      <Field id="c-message" label="Message">
        <textarea
          id="c-message"
          rows={5}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm md:text-sm"
        />
      </Field>
      {/* Honeypot: hidden from people, filled by bots */}
      <div className="hidden" aria-hidden="true">
        <label htmlFor="company_website">Company website</label>
        <input id="company_website" name="company_website" tabIndex={-1} autoComplete="off" />
      </div>
      <Button type="submit" disabled={busy || !name || !email || message.length < 10}>
        {busy ? 'Sending…' : 'Send message'}
      </Button>
    </form>
  );
}
