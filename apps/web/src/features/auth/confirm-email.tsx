'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { api, messageOf } from '@/lib/api';

export function ConfirmEmail({ token }: { token: string }) {
  const [state, setState] = useState<
    { kind: 'busy' } | { kind: 'ok'; email: string } | { kind: 'error'; text: string }
  >({ kind: 'busy' });
  useEffect(() => {
    let cancelled = false;
    api
      .post<{ email: string }>('/profile/email-change/confirm', { token })
      .then((r) => !cancelled && setState({ kind: 'ok', email: r.email }))
      .catch((e) => !cancelled && setState({ kind: 'error', text: messageOf(e) }));
    return () => {
      cancelled = true;
    };
  }, [token]);
  if (state.kind === 'busy') return <p className="text-sm text-muted-foreground">Confirming…</p>;
  return (
    <div className="space-y-4">
      <Alert variant={state.kind === 'ok' ? 'success' : 'destructive'}>
        <AlertDescription>
          {state.kind === 'ok' ? `Your email is now ${state.email}.` : state.text}
        </AlertDescription>
      </Alert>
      <Button asChild className="w-full">
        <Link href="/profile">Back to my profile</Link>
      </Button>
    </div>
  );
}
