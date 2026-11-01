'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { forgotPasswordRequestSchema } from '@inspower/shared';
import { z } from 'zod';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { api, messageOf } from '@/lib/api';

type Values = z.infer<typeof forgotPasswordRequestSchema>;

export function ForgotPasswordForm() {
  const [done, setDone] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { register, handleSubmit, formState } = useForm<Values>({
    resolver: zodResolver(forgotPasswordRequestSchema),
    defaultValues: { email: '' },
  });

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      const r = await api.post<{ message: string }>('/auth/forgot-password', values);
      setDone(r.message);
    } catch (e) {
      setError(messageOf(e));
    }
  });

  if (done) {
    return (
      <Alert variant="success">
        <AlertDescription>{done} The link works once and expires in 30 minutes.</AlertDescription>
      </Alert>
    );
  }

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
      <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? 'Sending…' : 'Send reset link'}
      </Button>
    </form>
  );
}
