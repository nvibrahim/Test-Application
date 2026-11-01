'use client';

import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { stepUpStatusSchema } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@inspower/ui/components/dialog';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, ApiRequestError, messageOf } from '@/lib/api';

type Resolver = { resolve: (ok: boolean) => void };

const StepUpContext = createContext<{ ensure: () => Promise<boolean> } | null>(null);

/**
 * Wraps the app. `withStepUp(action)` runs the action; if the API answers `step_up_required`,
 * a dialog asks for the password or a code and the action runs again.
 */
export function StepUpProvider({
  children,
  twoFactorEnabled,
}: {
  children: React.ReactNode;
  twoFactorEnabled: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [method, setMethod] = useState<'password' | 'totp'>('password');
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pending = useRef<Resolver | null>(null);

  const ensure = useCallback(() => {
    setValue('');
    setError(null);
    setMethod('password');
    setOpen(true);
    return new Promise<boolean>((resolve) => {
      pending.current = { resolve };
    });
  }, []);

  function finish(ok: boolean) {
    setOpen(false);
    pending.current?.resolve(ok);
    pending.current = null;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = method === 'password' ? { password: value } : { code: value };
      const status = await api.post('/auth/step-up', body, stepUpStatusSchema);
      if (status.active) finish(true);
    } catch (err) {
      if (err instanceof ApiRequestError && err.code === 'unauthenticated') {
        window.location.href = '/sign-in';
        return;
      }
      setError(messageOf(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <StepUpContext.Provider value={{ ensure }}>
      {children}
      <Dialog open={open} onOpenChange={(o) => (o ? setOpen(true) : finish(false))}>
        <DialogContent aria-describedby="step-up-description">
          <form onSubmit={submit} className="space-y-4" noValidate>
            <DialogHeader>
              <DialogTitle>Confirm it is you</DialogTitle>
              <DialogDescription id="step-up-description">
                This action is sensitive. Enter your{' '}
                {method === 'password' ? 'password' : 'authenticator code'} to continue.
              </DialogDescription>
            </DialogHeader>
            {error ? (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            ) : null}
            <Field id="step-up-value" label={method === 'password' ? 'Password' : '6-digit code'}>
              <Input
                {...fieldA11y('step-up-value')}
                type={method === 'password' ? 'password' : 'text'}
                inputMode={method === 'password' ? undefined : 'numeric'}
                autoComplete={method === 'password' ? 'current-password' : 'one-time-code'}
                value={value}
                onChange={(e) => setValue(e.target.value)}
                autoFocus
              />
            </Field>
            {twoFactorEnabled ? (
              <button
                type="button"
                className="text-sm text-primary underline-offset-4 hover:underline"
                onClick={() => {
                  setMethod(method === 'password' ? 'totp' : 'password');
                  setValue('');
                }}
              >
                {method === 'password'
                  ? 'Use a code from my authenticator app instead'
                  : 'Use my password instead'}
              </button>
            ) : null}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => finish(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={busy || !value}>
                {busy ? 'Checking…' : 'Continue'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </StepUpContext.Provider>
  );
}

/** Runs an API action, asking for step-up when the API says so, then running it again. */
export function useStepUp() {
  const ctx = useContext(StepUpContext);
  return useCallback(
    async <T,>(action: () => Promise<T>): Promise<T | undefined> => {
      try {
        return await action();
      } catch (err) {
        if (err instanceof ApiRequestError && err.code === 'step_up_required' && ctx) {
          const ok = await ctx.ensure();
          if (!ok) return undefined;
          return action();
        }
        throw err;
      }
    },
    [ctx],
  );
}
