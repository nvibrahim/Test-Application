'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { Profile } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Select } from '@inspower/ui/components/select';
import { api, messageOf } from '@/lib/api';

export function PreferencesForm({ preferences }: { preferences: Profile['preferences'] }) {
  const router = useRouter();
  const [theme, setTheme] = useState(preferences.theme);
  const [density, setDensity] = useState(preferences.density);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      await api.put('/profile/preferences', { theme, density });
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
      <Field id="theme" label="Appearance">
        <Select
          {...fieldA11y('theme')}
          value={theme}
          onChange={(e) => setTheme(e.target.value as typeof theme)}
        >
          <option value="system">Match my device</option>
          <option value="light">Light</option>
          <option value="dark">Dark</option>
        </Select>
      </Field>
      <Field id="density" label="Table density">
        <Select
          {...fieldA11y('density')}
          value={density}
          onChange={(e) => setDensity(e.target.value as typeof density)}
        >
          <option value="comfortable">Comfortable</option>
          <option value="compact">Compact</option>
        </Select>
      </Field>
      <Button type="submit" disabled={busy}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </form>
  );
}
