'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SessionListItem } from '@inspower/shared';
import { Badge } from '@inspower/ui/components/badge';
import { Button } from '@inspower/ui/components/button';
import { api } from '@/lib/api';

export function SessionsList({ sessions }: { sessions: SessionListItem[] }) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);

  async function revoke(id: string) {
    setBusy(id);
    try {
      await api.delete(`/profile/sessions/${id}`);
      router.refresh();
    } finally {
      setBusy(null);
    }
  }
  async function signOutOthers() {
    setBusy('others');
    try {
      await api.post('/profile/sessions/sign-out-others');
      router.refresh();
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <ul className="divide-y rounded-lg border">
        {sessions.map((s) => (
          <li key={s.id} className="flex flex-wrap items-center justify-between gap-3 p-4 text-sm">
            <div>
              <div className="flex items-center gap-2 font-medium">
                {s.deviceLabel ?? 'Unknown device'}
                {s.current ? <Badge variant="secondary">This device</Badge> : null}
              </div>
              <div className="text-muted-foreground">
                {s.ip ?? 'Unknown address'} · signed in{' '}
                {new Date(s.createdAt).toLocaleString('en-GB')} · last seen{' '}
                {new Date(s.lastSeenAt).toLocaleTimeString('en-GB')}
              </div>
            </div>
            {s.current ? null : (
              <Button
                variant="outline"
                size="sm"
                onClick={() => revoke(s.id)}
                disabled={busy !== null}
              >
                Sign out
              </Button>
            )}
          </li>
        ))}
      </ul>
      {sessions.length > 1 ? (
        <Button variant="destructive" onClick={signOutOthers} disabled={busy !== null}>
          Sign out everywhere else
        </Button>
      ) : null}
    </div>
  );
}
