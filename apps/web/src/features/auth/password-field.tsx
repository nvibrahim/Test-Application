'use client';

import { useEffect, useState } from 'react';
import { passwordCheckResponseSchema } from '@inspower/shared';
import { Input } from '@inspower/ui/components/input';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { api } from '@/lib/api';

const labels = ['Very weak', 'Weak', 'Fair', 'Strong', 'Very strong'];

/**
 * A new-password box with live strength feedback from the API's shared rules. The breach and
 * history checks happen on submit, server side.
 */
export function PasswordField({
  id,
  label,
  value,
  onChange,
  error,
  email,
  fullName,
  autoComplete = 'new-password',
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  error?: string;
  email?: string;
  fullName?: string;
  autoComplete?: string;
}) {
  const [feedback, setFeedback] = useState<{ score: number; problems: string[] } | null>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const handle = setTimeout(() => {
      if (!value) {
        setFeedback(null);
        return;
      }
      api
        .post(
          '/auth/password/check',
          { password: value, email: email || undefined, fullName: fullName || undefined },
          passwordCheckResponseSchema,
        )
        .then((r) => setFeedback({ score: r.score, problems: r.problems }))
        .catch(() => setFeedback(null));
    }, 250);
    return () => clearTimeout(handle);
  }, [value, email, fullName]);

  const score = feedback?.score ?? 0;
  const help = feedback && !feedback.problems.length ? labels[score] : feedback?.problems[0];

  return (
    <Field
      id={id}
      label={label}
      error={error}
      help={value ? help : 'At least 8 characters. A phrase of unrelated words works well.'}
    >
      <div className="flex gap-2">
        <Input
          {...fieldA11y(id, error)}
          type={show ? 'text' : 'password'}
          autoComplete={autoComplete}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          maxLength={128}
          className="flex-1"
        />
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          className="min-h-11 rounded-md border px-3 text-sm text-muted-foreground hover:text-foreground md:min-h-9"
          aria-pressed={show}
        >
          {show ? 'Hide' : 'Show'}
        </button>
      </div>
      {value ? (
        <div className="flex gap-1" aria-hidden="true">
          {[0, 1, 2, 3].map((i) => (
            <div
              key={i}
              className={
                'h-1.5 flex-1 rounded-full ' +
                (i < score
                  ? score >= 3
                    ? 'bg-success'
                    : score === 2
                      ? 'bg-warning'
                      : 'bg-destructive'
                  : 'bg-muted')
              }
            />
          ))}
        </div>
      ) : null}
    </Field>
  );
}
