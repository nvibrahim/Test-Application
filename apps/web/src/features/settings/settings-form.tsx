'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { SettingsSectionKey, SettingsSectionResponse } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Checkbox } from '@inspower/ui/components/checkbox';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { Select } from '@inspower/ui/components/select';
import { api, messageOf } from '@/lib/api';
import { useStepUp } from '@/features/two-factor/step-up-dialog';
import { emailProviderPresets, sectionFields, type FieldSpec } from './section-fields';

function get(obj: unknown, path: string): unknown {
  return path
    .split('.')
    .reduce<unknown>(
      (o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined),
      obj,
    );
}
function set(obj: Record<string, unknown>, path: string, value: unknown): Record<string, unknown> {
  const keys = path.split('.');
  const out: Record<string, unknown> = { ...obj };
  let cur: Record<string, unknown> = out;
  keys.forEach((k, i) => {
    if (i === keys.length - 1) cur[k] = value;
    else {
      cur[k] = { ...((cur[k] as Record<string, unknown>) ?? {}) };
      cur = cur[k] as Record<string, unknown>;
    }
  });
  return out;
}

/** One form for every section, drawn from `sectionFields`; validation is the API's shared schema. */
export function SettingsForm({
  section,
  data,
  canEdit,
}: {
  section: SettingsSectionKey;
  data: SettingsSectionResponse;
  canEdit: boolean;
}) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const [value, setValue] = useState<Record<string, unknown>>(data.value);
  const [secrets, setSecrets] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const dirty =
    JSON.stringify(value) !== JSON.stringify(data.value) || Object.values(secrets).some(Boolean);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const body = {
        ...value,
        ...Object.fromEntries(Object.entries(secrets).filter(([, v]) => v)),
      };
      const r = await withStepUp(() => api.put(`/settings/${section}`, body));
      if (r !== undefined) {
        setMessage({ kind: 'ok', text: 'Saved.' });
        setSecrets({});
        router.refresh();
      }
    } catch (err) {
      setMessage({ kind: 'error', text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  async function testEmail() {
    setTesting(true);
    setMessage(null);
    try {
      const r = await withStepUp(() =>
        api.post<{ ok: boolean; message: string }>('/settings/email/test'),
      );
      if (r) setMessage({ kind: r.ok ? 'ok' : 'error', text: r.message });
    } catch (err) {
      setMessage({ kind: 'error', text: messageOf(err) });
    } finally {
      setTesting(false);
    }
  }

  function applyPreset(key: string) {
    const p = emailProviderPresets.find((x) => x.key === key);
    if (!p) return;
    setValue((v) => ({ ...v, host: p.host, port: p.port, security: p.security }));
  }

  return (
    <form onSubmit={save} className="space-y-6" noValidate>
      {message ? (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      {section === 'email' ? (
        <Field
          id="preset"
          label="Email provider"
          help="Fills in the server, port and security; you still enter the user and the app password."
        >
          <Select
            {...fieldA11y('preset')}
            defaultValue=""
            onChange={(e) => applyPreset(e.target.value)}
            disabled={!canEdit}
          >
            <option value="">Custom or Mailpit</option>
            {emailProviderPresets.map((p) => (
              <option key={p.key} value={p.key}>
                {p.label}
              </option>
            ))}
          </Select>
        </Field>
      ) : null}
      {sectionFields[section].map((group, gi) => (
        <fieldset key={gi} className="space-y-4">
          {group.title ? <legend className="text-base font-semibold">{group.title}</legend> : null}
          {group.fields.map((f) => (
            <FieldControl
              key={f.path}
              spec={f}
              value={f.type === 'password' ? (secrets[f.path] ?? '') : get(value, f.path)}
              secretSet={data.secretsSet.includes(f.path)}
              disabled={!canEdit}
              onChange={(v) =>
                f.type === 'password'
                  ? setSecrets((s) => ({ ...s, [f.path]: String(v) }))
                  : setValue((cur) => set(cur, f.path, v))
              }
            />
          ))}
        </fieldset>
      ))}
      <div className="flex flex-wrap items-center gap-3">
        {canEdit ? (
          <Button type="submit" disabled={busy || !dirty}>
            {busy ? 'Saving…' : 'Save changes'}
          </Button>
        ) : null}
        {section === 'email' && canEdit ? (
          <Button type="button" variant="outline" disabled={testing} onClick={testEmail}>
            {testing ? 'Sending…' : 'Send test email'}
          </Button>
        ) : null}
        <span className="text-xs text-muted-foreground">
          {data.updatedAt
            ? `Last saved ${new Date(data.updatedAt).toLocaleString('en-GB')}${data.updatedByName ? ` by ${data.updatedByName}` : ''}.`
            : 'Never saved; these are the defaults.'}
        </span>
      </div>
    </form>
  );
}

function FieldControl({
  spec,
  value,
  secretSet,
  disabled,
  onChange,
}: {
  spec: FieldSpec;
  value: unknown;
  secretSet: boolean;
  disabled: boolean;
  onChange: (v: unknown) => void;
}) {
  const id = `f-${spec.path.replace(/\./g, '-')}`;
  switch (spec.type) {
    case 'boolean':
      return (
        <label className="flex items-start gap-2 text-sm">
          <Checkbox
            checked={Boolean(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.checked)}
            className="mt-0.5"
          />
          <span>
            {spec.label}
            {spec.help ? (
              <span className="block text-xs text-muted-foreground">{spec.help}</span>
            ) : null}
          </span>
        </label>
      );
    case 'select':
      return (
        <Field id={id} label={spec.label} help={spec.help}>
          <Select
            {...fieldA11y(id, undefined, spec.help)}
            value={String(value ?? '')}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                typeof spec.options[0]?.value === 'number'
                  ? Number(e.target.value)
                  : e.target.value,
              )
            }
          >
            {spec.options.map((o) => (
              <option key={String(o.value)} value={String(o.value)}>
                {o.label}
              </option>
            ))}
          </Select>
        </Field>
      );
    case 'number':
      return (
        <Field id={id} label={spec.label} help={spec.help}>
          <Input
            {...fieldA11y(id, undefined, spec.help)}
            type="number"
            inputMode="numeric"
            min={spec.min}
            max={spec.max}
            value={value === null || value === undefined ? '' : String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === '' ? null : Number(e.target.value))}
          />
        </Field>
      );
    case 'textarea':
      return (
        <Field id={id} label={spec.label} help={spec.help}>
          <textarea
            id={id}
            value={String(value ?? '')}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm md:text-sm"
          />
        </Field>
      );
    case 'multi':
      return (
        <fieldset className="space-y-2">
          <legend className="text-sm font-medium">{spec.label}</legend>
          {spec.help ? <p className="text-xs text-muted-foreground">{spec.help}</p> : null}
          <div className="grid gap-2 sm:grid-cols-2">
            {spec.options.map((o) => {
              const list = Array.isArray(value) ? (value as string[]) : [];
              const checked = list.includes(o.value);
              return (
                <label key={o.value} className="flex items-center gap-2 text-sm">
                  <Checkbox
                    checked={checked}
                    disabled={disabled}
                    onChange={(e) =>
                      onChange(
                        e.target.checked ? [...list, o.value] : list.filter((x) => x !== o.value),
                      )
                    }
                  />
                  {o.label}
                </label>
              );
            })}
          </div>
        </fieldset>
      );
    case 'list': {
      const list = Array.isArray(value) ? (value as string[]) : [];
      return (
        <Field id={id} label={spec.label} help={spec.help ?? 'One per line.'}>
          <textarea
            id={id}
            value={list.join('\n')}
            disabled={disabled}
            onChange={(e) =>
              onChange(
                e.target.value
                  .split('\n')
                  .map((s) => s.trim())
                  .filter(Boolean),
              )
            }
            rows={3}
            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm md:text-sm"
          />
        </Field>
      );
    }
    case 'password':
      return (
        <Field
          id={id}
          label={spec.label}
          help={secretSet ? 'A password is saved. Type a new one to replace it.' : spec.help}
        >
          <Input
            {...fieldA11y(id)}
            type="password"
            autoComplete="new-password"
            value={String(value ?? '')}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value)}
            placeholder={secretSet ? '••••••••' : ''}
          />
        </Field>
      );
    default:
      return (
        <Field id={id} label={spec.label} help={spec.help}>
          <Input
            {...fieldA11y(id, undefined, spec.help)}
            type={spec.type}
            value={value === null || value === undefined ? '' : String(value)}
            disabled={disabled}
            onChange={(e) => onChange(e.target.value === '' ? null : e.target.value)}
          />
        </Field>
      );
  }
}
