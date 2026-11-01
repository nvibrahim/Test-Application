'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { OrganizationProfile } from '@inspower/shared';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { Select } from '@inspower/ui/components/select';
import { api, messageOf } from '@/lib/api';
import { useStepUp } from '@/features/two-factor/step-up-dialog';

interface Reference {
  countries: { code: string; name: string }[];
  currencies: { code: string; name: string }[];
  timeZones: string[];
}

/** Opens as a read-only preview; Edit switches to the form; Cancel asks when there are unsaved changes. */
export function OrganizationEditor({
  profile,
  reference,
  canEdit,
}: {
  profile: OrganizationProfile;
  reference: Reference;
  canEdit: boolean;
}) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(profile);
  const [message, setMessage] = useState<{ kind: 'ok' | 'error'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const dirty = JSON.stringify(form) !== JSON.stringify(profile);

  function cancel() {
    if (dirty && !window.confirm('Discard your changes?')) return;
    setForm(profile);
    setEditing(false);
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMessage(null);
    try {
      const body = {
        legalName: form.legalName,
        tradingName: form.tradingName,
        countryCode: form.countryCode ?? undefined,
        currencyCode: form.currencyCode ?? undefined,
        timeZone: form.timeZone,
        addressLines: form.addressLines.filter(Boolean),
        documentFooter: form.documentFooter,
        version: profile.version,
      };
      const r = await withStepUp(() => api.put('/organization', body));
      if (r !== undefined) {
        setMessage({ kind: 'ok', text: 'Saved.' });
        setEditing(false);
        router.refresh();
      }
    } catch (err) {
      setMessage({ kind: 'error', text: messageOf(err) });
    } finally {
      setBusy(false);
    }
  }

  const row = (label: string, value: string | null | undefined) => (
    <div className="grid grid-cols-[10rem_1fr] gap-2 py-2 text-sm">
      <dt className="text-muted-foreground">{label}</dt>
      <dd>{value || <span className="text-muted-foreground">—</span>}</dd>
    </div>
  );

  if (!editing) {
    return (
      <div className="space-y-4">
        {message ? (
          <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
            <AlertDescription>{message.text}</AlertDescription>
          </Alert>
        ) : null}
        <dl className="divide-y">
          {row('Legal name', profile.legalName)}
          {row('Trading name', profile.tradingName)}
          {row(
            'Country',
            reference.countries.find((c) => c.code === profile.countryCode)?.name ??
              profile.countryCode,
          )}
          {row('Currency', profile.currencyCode)}
          {row('Time zone', profile.timeZone)}
          {row('Address', profile.addressLines.join(', '))}
          {row('Document footer', profile.documentFooter)}
        </dl>
        {canEdit ? <Button onClick={() => setEditing(true)}>Edit profile</Button> : null}
      </div>
    );
  }

  return (
    <form onSubmit={save} className="max-w-xl space-y-4" noValidate>
      {message ? (
        <Alert variant={message.kind === 'ok' ? 'success' : 'destructive'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      ) : null}
      <Field id="legalName" label="Legal name" help="Changing it asks for your password or a code.">
        <Input
          {...fieldA11y('legalName')}
          value={form.legalName}
          onChange={(e) => setForm({ ...form, legalName: e.target.value })}
        />
      </Field>
      <Field id="tradingName" label="Trading name">
        <Input
          {...fieldA11y('tradingName')}
          value={form.tradingName ?? ''}
          onChange={(e) => setForm({ ...form, tradingName: e.target.value || null })}
        />
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field id="countryCode" label="Country">
          <Select
            {...fieldA11y('countryCode')}
            value={form.countryCode ?? ''}
            onChange={(e) => setForm({ ...form, countryCode: e.target.value })}
          >
            {reference.countries.map((c) => (
              <option key={c.code} value={c.code}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="currencyCode" label="Currency">
          <Select
            {...fieldA11y('currencyCode')}
            value={form.currencyCode ?? ''}
            onChange={(e) => setForm({ ...form, currencyCode: e.target.value })}
          >
            {reference.currencies.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} · {c.name}
              </option>
            ))}
          </Select>
        </Field>
      </div>
      <Field id="timeZone" label="Time zone">
        <Select
          {...fieldA11y('timeZone')}
          value={form.timeZone}
          onChange={(e) => setForm({ ...form, timeZone: e.target.value })}
        >
          {reference.timeZones.map((z) => (
            <option key={z} value={z}>
              {z}
            </option>
          ))}
        </Select>
      </Field>
      <Field id="address" label="Address" help="One line per row.">
        <textarea
          id="address"
          rows={3}
          value={form.addressLines.join('\n')}
          onChange={(e) => setForm({ ...form, addressLines: e.target.value.split('\n') })}
          className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-base shadow-sm md:text-sm"
        />
      </Field>
      <Field id="footer" label="Document footer">
        <Input
          {...fieldA11y('footer')}
          value={form.documentFooter ?? ''}
          onChange={(e) => setForm({ ...form, documentFooter: e.target.value || null })}
        />
      </Field>
      <div className="flex gap-2">
        <Button type="submit" disabled={busy || !dirty}>
          {busy ? 'Saving…' : 'Save'}
        </Button>
        <Button type="button" variant="outline" onClick={cancel}>
          Cancel
        </Button>
      </div>
    </form>
  );
}
