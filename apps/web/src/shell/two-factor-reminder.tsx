'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ShieldAlert } from 'lucide-react';
import { Button } from '@inspower/ui/components/button';
import { api } from '@/lib/api';

/** Shown until two-step verification is set up; dismissing hides it for the interval in Settings. */
export function TwoFactorReminder({ intervalDays }: { intervalDays: number }) {
  const router = useRouter();
  const [hidden, setHidden] = useState(false);
  if (hidden) return null;
  async function dismiss() {
    setHidden(true);
    await api.post('/two-factor/reminder/dismiss').catch(() => undefined);
    router.refresh();
  }
  return (
    <div
      role="status"
      className="flex flex-wrap items-center justify-between gap-3 border-b bg-primary/10 px-4 py-2 text-sm"
    >
      <span className="flex items-center gap-2">
        <ShieldAlert className="size-4 text-primary" aria-hidden="true" />
        Protect your account: set up two-step verification.
      </span>
      <span className="flex items-center gap-2">
        <Button asChild size="sm">
          <Link href="/profile?tab=security">Set up now</Link>
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={dismiss}
          aria-label={`Remind me in ${intervalDays} days`}
        >
          Later
        </Button>
      </span>
    </div>
  );
}
