'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Checkbox } from '@inspower/ui/components/checkbox';
import { api, messageOf } from '@/lib/api';

type Pref = { type: string; label: string; description: string; inApp: boolean; email: boolean };

export function NotificationPreferences({ preferences }: { preferences: Pref[] }) {
  const router = useRouter();
  const [prefs, setPrefs] = useState(preferences);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(prefs) !== JSON.stringify(preferences);

  async function save() {
    setBusy(true);
    setMessage(null);
    try {
      await api.put('/profile/notifications', {
        preferences: prefs.map((p) => ({ type: p.type, inApp: p.inApp, email: p.email })),
      });
      setMessage({ kind: 'ok', text: 'Saved.' });
      router.refresh();
    } catch (e) {
      setMessage({ kind: 'error', text: messageOf(e) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      {message ? (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      <table className="w-full text-sm">
        <thead className="text-left text-muted-foreground">
          <tr>
            <th className="py-2 font-medium">Event</th>
            <th className="py-2 text-center font-medium">In the app</th>
            <th className="py-2 text-center font-medium">Email</th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {prefs.map((p, i) => (
            <tr key={p.type}>
              <td className="py-3">
                <div className="font-medium">{p.label}</div>
                <div className="text-xs text-muted-foreground">{p.description}</div>
              </td>
              <td className="py-3 text-center">
                <Checkbox
                  aria-label={`${p.label}: in the app`}
                  checked={p.inApp}
                  onChange={(e) =>
                    setPrefs(prefs.map((x, j) => (j === i ? { ...x, inApp: e.target.checked } : x)))
                  }
                />
              </td>
              <td className="py-3 text-center">
                <Checkbox
                  aria-label={`${p.label}: email`}
                  checked={p.email}
                  onChange={(e) =>
                    setPrefs(prefs.map((x, j) => (j === i ? { ...x, email: e.target.checked } : x)))
                  }
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <Button disabled={busy || !dirty} onClick={save}>
        {busy ? 'Saving…' : 'Save'}
      </Button>
    </div>
  );
}
