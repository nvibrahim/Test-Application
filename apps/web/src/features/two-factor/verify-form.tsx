'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { twoFactorVerifyResponseSchema } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Checkbox } from '@inspower/ui/components/checkbox';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, ApiRequestError, messageOf } from '@/lib/api';

export function VerifyForm({ trustedDeviceDays }: { trustedDeviceDays: number }) {
  const router = useRouter();
  const [mode, setMode] = useState<'code' | 'recovery'>('code');
  const [value, setValue] = useState('');
  const [trust, setTrust] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body =
        mode === 'code'
          ? { code: value, trustDevice: trust }
          : { recoveryCode: value, trustDevice: trust };
      const r = await api.post('/auth/two-factor/verify', body, twoFactorVerifyResponseSchema);
      if (r.recoveryCodesLeft !== undefined)
        sessionStorage.setItem('recovery-codes-left', String(r.recoveryCodesLeft));
      router.push(r.next);
      router.refresh();
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'unauthenticated') {
        router.push('/sign-in');
        router.refresh();
        return;
      }
      setError(messageOf(err));
      setValue('');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {mode === 'code' ? (
        <Field
          id="code"
          label="6-digit code"
          help="Open your authenticator app and type the code for this account."
        >
          <Input
            {...fieldA11y('code')}
            inputMode="numeric"
            autoComplete="one-time-code"
            pattern="[0-9 ]*"
            maxLength={7}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="text-center text-2xl tracking-[0.4em]"
          />
        </Field>
      ) : (
        <Field
          id="recovery"
          label="Recovery code"
          help="One of the ten codes you saved when you set this up. Each works once."
        >
          <Input
            {...fieldA11y('recovery')}
            autoComplete="off"
            autoCapitalize="characters"
            maxLength={11}
            value={value}
            onChange={(e) => setValue(e.target.value)}
            autoFocus
            className="font-mono uppercase"
          />
        </Field>
      )}
      {trustedDeviceDays > 0 ? (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={trust}
            onChange={(e) => setTrust(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            Trust this device for {trustedDeviceDays} days
            <span className="block text-xs text-muted-foreground">
              Only on a device that is yours. You can remove it from Profile → Security.
            </span>
          </span>
        </label>
      ) : null}
      <Button type="submit" className="w-full" disabled={busy || !value}>
        {busy ? 'Checking…' : 'Continue'}
      </Button>
      <button
        type="button"
        className="block w-full text-center text-sm text-primary underline-offset-4 hover:underline"
        onClick={() => {
          setMode(mode === 'code' ? 'recovery' : 'code');
          setValue('');
          setError(null);
        }}
      >
        {mode === 'code'
          ? 'Lost your phone? Use a recovery code'
          : 'Use a code from my authenticator app'}
      </button>
    </form>
  );
}
