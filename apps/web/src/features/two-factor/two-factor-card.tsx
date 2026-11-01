'use client';

import Image from 'next/image';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  recoveryCodesResponseSchema,
  twoFactorSetupResponseSchema,
  type TwoFactorSetupResponse,
  type TwoFactorStatus,
} from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Badge } from '@inspower/ui/components/badge';
import { Button } from '@inspower/ui/components/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@inspower/ui/components/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@inspower/ui/components/dialog';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';
import { RecoveryCodes } from './recovery-codes';
import { useStepUp } from './step-up-dialog';

export function TwoFactorCard({ status }: { status: TwoFactorStatus }) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const [setup, setSetup] = useState<TwoFactorSetupResponse | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function start() {
    setError(null);
    setBusy(true);
    try {
      setSetup(await api.post('/two-factor/setup', undefined, twoFactorSetupResponseSchema));
    } catch (e) {
      setError(messageOf(e));
    } finally {
      setBusy(false);
    }
  }

  async function confirm(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const r = await api.post('/two-factor/confirm', { code }, recoveryCodesResponseSchema);
      setCodes(r.recoveryCodes);
      setCode('');
    } catch (err) {
      setError(messageOf(err));
      setCode('');
    } finally {
      setBusy(false);
    }
  }

  function finishSetup() {
    setSetup(null);
    setCodes(null);
    setMessage('Two-step verification is on.');
    router.refresh();
  }

  async function disable() {
    setError(null);
    const done = await withStepUp(() => api.post('/two-factor/disable')).catch((e) => {
      setError(messageOf(e));
      return undefined;
    });
    if (done !== undefined) {
      setMessage('Two-step verification is off.');
      router.refresh();
    }
  }

  async function regenerate() {
    setError(null);
    const r = await withStepUp(() =>
      api.post('/two-factor/recovery-codes/regenerate', undefined, recoveryCodesResponseSchema),
    ).catch((e) => {
      setError(messageOf(e));
      return undefined;
    });
    if (r) setCodes(r.recoveryCodes);
  }

  async function revokeDevice(id: string) {
    await api.delete(`/two-factor/trusted-devices/${id}`).catch((e) => setError(messageOf(e)));
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center justify-between gap-3">
          <span>Two-step verification</span>
          <Badge variant={status.enabled ? 'success' : 'secondary'}>
            {status.enabled ? 'On' : 'Off'}
          </Badge>
        </CardTitle>
        <CardDescription>
          {status.enabled
            ? `On since ${new Date(status.confirmedAt!).toLocaleDateString('en-GB')}. ${status.recoveryCodesLeft} recovery code${status.recoveryCodesLeft === 1 ? '' : 's'} left.`
            : 'A code from your phone makes a stolen password useless. It takes two minutes with Microsoft Authenticator, Google Authenticator or any TOTP app.'}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {error ? (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        ) : null}
        {message ? (
          <Alert variant="success">
            <AlertDescription>{message}</AlertDescription>
          </Alert>
        ) : null}

        {status.enabled ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={regenerate}>
              Make new recovery codes
            </Button>
            <Button variant="destructive" onClick={disable}>
              Turn off
            </Button>
          </div>
        ) : (
          <Button onClick={start} disabled={busy}>
            {busy ? 'Preparing…' : 'Set up two-step verification'}
          </Button>
        )}

        {status.enabled && status.trustedDevices.length ? (
          <div className="space-y-2">
            <h4 className="text-sm font-medium">Trusted devices</h4>
            <ul className="divide-y rounded-md border text-sm">
              {status.trustedDevices.map((d) => (
                <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 p-3">
                  <div>
                    <div className="flex items-center gap-2 font-medium">
                      {d.label ?? 'Unknown device'}
                      {d.current ? <Badge variant="secondary">This device</Badge> : null}
                    </div>
                    <div className="text-muted-foreground">
                      trusted until {new Date(d.expiresAt).toLocaleDateString('en-GB')}
                      {d.lastUsedAt
                        ? ` · last used ${new Date(d.lastUsedAt).toLocaleDateString('en-GB')}`
                        : ''}
                    </div>
                  </div>
                  <Button variant="outline" size="sm" onClick={() => revokeDevice(d.id)}>
                    Remove
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </CardContent>

      {/* Set-up flow: QR and key -> first code -> recovery codes */}
      <Dialog
        open={setup !== null && codes === null}
        onOpenChange={(o) => (!o ? setSetup(null) : undefined)}
      >
        <DialogContent aria-describedby="setup-description">
          <DialogHeader>
            <DialogTitle>Set up two-step verification</DialogTitle>
            <DialogDescription id="setup-description">
              1. Open your authenticator app and add an account. 2. Scan the code, or type the key.
              3. Enter the 6-digit code it shows.
            </DialogDescription>
          </DialogHeader>
          {setup ? (
            <form onSubmit={confirm} className="space-y-4" noValidate>
              <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-start">
                <Image
                  src={setup.qrDataUrl}
                  alt={`QR code for ${setup.account} at ${setup.issuer}`}
                  width={200}
                  height={200}
                  unoptimized
                  className="rounded-md border bg-white p-2"
                />
                <div className="min-w-0 flex-1 space-y-2 text-sm">
                  <p className="text-muted-foreground">
                    Cannot scan? Type this key into the app instead:
                  </p>
                  <code
                    className="block break-all rounded-md border bg-muted/40 p-2 font-mono text-xs"
                    data-testid="totp-secret"
                  >
                    {setup.secret}
                  </code>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => navigator.clipboard?.writeText(setup.secret)}
                  >
                    Copy key
                  </Button>
                </div>
              </div>
              <Field id="setup-code" label="6-digit code from the app">
                <Input
                  {...fieldA11y('setup-code')}
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={7}
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  className="text-center text-2xl tracking-[0.4em]"
                />
              </Field>
              {error ? (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              ) : null}
              <Button
                type="submit"
                className="w-full"
                disabled={busy || code.replace(/\s/g, '').length !== 6}
              >
                {busy ? 'Checking…' : 'Turn on'}
              </Button>
            </form>
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog
        open={codes !== null}
        onOpenChange={(o) => (!o ? (setup ? finishSetup() : setCodes(null)) : undefined)}
      >
        <DialogContent aria-describedby="codes-description">
          <DialogHeader>
            <DialogTitle>Your recovery codes</DialogTitle>
            <DialogDescription id="codes-description">
              Use one if you ever lose your phone.
            </DialogDescription>
          </DialogHeader>
          {codes ? (
            <RecoveryCodes codes={codes} onDone={() => (setup ? finishSetup() : setCodes(null))} />
          ) : null}
        </DialogContent>
      </Dialog>
    </Card>
  );
}
