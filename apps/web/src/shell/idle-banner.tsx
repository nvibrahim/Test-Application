'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Button } from '@inspower/ui/components/button';
import { api } from '@/lib/api';

/**
 * Warns before the idle timeout and offers "Stay signed in". A banner, not a modal, so it stays
 * visible on small screens. When the session is gone, the person is sent to /session-ended.
 */
export function IdleBanner({
  idleExpiresAt,
  warningMinutes,
}: {
  idleExpiresAt: string;
  warningMinutes: number;
}) {
  const router = useRouter();
  // A newer value from the server (each navigation) replaces any extension made here.
  const [seen, setSeen] = useState(idleExpiresAt);
  const [extended, setExtended] = useState<number | null>(null);
  if (seen !== idleExpiresAt) {
    setSeen(idleExpiresAt);
    setExtended(null);
  }
  const expiresAt = extended ?? new Date(idleExpiresAt).getTime();
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);

  const remaining = expiresAt - now;
  useEffect(() => {
    if (remaining <= 0) {
      router.push('/session-ended');
      router.refresh();
    }
  }, [remaining, router]);

  if (remaining > warningMinutes * 60_000 || remaining <= 0) return null;
  const minutes = Math.floor(remaining / 60_000);
  const seconds = Math.floor((remaining % 60_000) / 1000);

  async function stay() {
    const r = await api.get<{ idleExpiresAt: string }>('/auth/session').catch(() => null);
    const ext = await api.post<{ idleExpiresAt: string }>('/auth/session/extend').catch(() => null);
    const next = ext?.idleExpiresAt ?? r?.idleExpiresAt;
    if (next) setExtended(new Date(next).getTime());
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="flex flex-wrap items-center justify-between gap-3 border-b border-warning/60 bg-warning/15 px-4 py-2 text-sm"
    >
      <span>
        You will be signed out in {minutes}:{String(seconds).padStart(2, '0')} because of
        inactivity.
      </span>
      <Button size="sm" onClick={stay}>
        Stay signed in
      </Button>
    </div>
  );
}
