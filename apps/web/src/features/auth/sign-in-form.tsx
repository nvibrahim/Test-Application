'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { signInRequestSchema, signInResponseSchema, type SignInRequest } from '@inspower/shared';
import type { z } from 'zod';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Checkbox } from '@inspower/ui/components/checkbox';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, ApiRequestError, messageOf } from '@/lib/api';

export function SignInForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<
    z.input<typeof signInRequestSchema>,
    unknown,
    SignInRequest
  >({
    resolver: zodResolver(signInRequestSchema),
    defaultValues: { email: '', password: '', rememberMe: false },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const result = await api.post('/auth/sign-in', values, signInResponseSchema);
      router.push(result.next);
      router.refresh();
    } catch (e) {
      if (e instanceof ApiRequestError && e.code === 'account_locked') {
        const until = (e.error.details as { until?: string } | undefined)?.until;
        setError(
          `${e.message}${until ? ` Locked until ${new Date(until).toLocaleTimeString()}.` : ''}`,
        );
      } else {
        setError(messageOf(e));
      }
    }
  });

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <Field id="email" label="Email" error={formState.errors.email?.message}>
        <Input
          {...fieldA11y('email', formState.errors.email?.message)}
          type="email"
          autoComplete="username"
          inputMode="email"
          autoFocus
          {...register('email')}
        />
      </Field>
      <Field id="password" label="Password" error={formState.errors.password?.message}>
        <Input
          {...fieldA11y('password', formState.errors.password?.message)}
          type="password"
          autoComplete="current-password"
          {...register('password')}
        />
      </Field>
      <div className="flex items-center justify-between gap-4">
        <label className="flex items-center gap-2 text-sm">
          <Checkbox {...register('rememberMe')} />
          Remember me
        </label>
        <Link
          href="/forgot-password"
          className="text-sm text-primary underline-offset-4 hover:underline"
        >
          Forgot password?
        </Link>
      </div>
      <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  );
}
