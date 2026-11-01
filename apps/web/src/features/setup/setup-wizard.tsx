'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { setupOrganizationRequestSchema, type SetupOrganizationRequest } from '@inspower/shared';
import { z } from 'zod';
import { Alert, AlertDescription } from '@inspower/ui/components/alert';
import { Button } from '@inspower/ui/components/button';
import { Field, fieldA11y } from '@inspower/ui/components/field';
import { Input } from '@inspower/ui/components/input';
import { Select } from '@inspower/ui/components/select';
import { api, messageOf } from '@/lib/api';

export interface SetupReference {
  countries: { code: string; name: string; currencyCode: string | null }[];
  currencies: { code: string; name: string; symbol: string | null }[];
  timeZones: string[];
}

type Values = z.input<typeof setupOrganizationRequestSchema>;

const defaultZoneFor: Record<string, string> = {
  GB: 'Europe/London',
  IE: 'Europe/Dublin',
  AE: 'Asia/Dubai',
  IN: 'Asia/Kolkata',
  US: 'America/New_York',
  AU: 'Australia/Sydney',
  NZ: 'Pacific/Auckland',
  SG: 'Asia/Singapore',
  SA: 'Asia/Riyadh',
  CA: 'America/Toronto',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
};

export function SetupWizard({
  reference,
  fullName,
}: {
  reference: SetupReference;
  fullName: string;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const browserZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone, []);
  const { register, handleSubmit, watch, setValue, formState } = useForm<Values>({
    resolver: zodResolver(setupOrganizationRequestSchema),
    defaultValues: {
      legalName: '',
      tradingName: '',
      countryCode: 'GB',
      currencyCode: 'GBP',
      timeZone: browserZone,
      addressLines: ['', ''],
      headOffice: { name: 'Head office', addressLines: [] },
    },
  });
  const country = watch('countryCode');

  function onCountry(code: string) {
    setValue('countryCode', code);
    const c = reference.countries.find((x) => x.code === code);
    if (c?.currencyCode) setValue('currencyCode', c.currencyCode);
    if (defaultZoneFor[code]) setValue('timeZone', defaultZoneFor[code]!);
  }

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    const body: SetupOrganizationRequest = setupOrganizationRequestSchema.parse({
      ...values,
      addressLines: (values.addressLines ?? []).filter((l) => l && l.trim()),
      headOffice: { ...values.headOffice, addressLines: [] },
    });
    try {
      await api.post('/setup/organization', body);
      router.push('/dashboard');
      router.refresh();
    } catch (e) {
      setError(messageOf(e));
    }
  });

  const err = formState.errors;
  return (
    <form onSubmit={onSubmit} className="space-y-6" noValidate>
      <p className="text-sm text-muted-foreground">
        Welcome, {fullName}. Two things before the app opens: the organization and its head office.
        Everything can be changed later in Settings.
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Organization</legend>
        <Field id="legalName" label="Legal name" error={err.legalName?.message}>
          <Input
            {...fieldA11y('legalName', err.legalName?.message)}
            autoFocus
            {...register('legalName')}
          />
        </Field>
        <Field
          id="tradingName"
          label="Trading name"
          help="Optional. Shown on screens and emails when it differs from the legal name."
        >
          <Input {...fieldA11y('tradingName')} {...register('tradingName')} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field id="countryCode" label="Country" error={err.countryCode?.message}>
            <Select
              {...fieldA11y('countryCode', err.countryCode?.message)}
              value={country}
              onChange={(e) => onCountry(e.target.value)}
            >
              {reference.countries.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field id="currencyCode" label="Currency" error={err.currencyCode?.message}>
            <Select
              {...fieldA11y('currencyCode', err.currencyCode?.message)}
              {...register('currencyCode')}
            >
              {reference.currencies.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.code} · {c.name}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field id="timeZone" label="Time zone" error={err.timeZone?.message}>
          <Select {...fieldA11y('timeZone', err.timeZone?.message)} {...register('timeZone')}>
            {reference.timeZones.map((z) => (
              <option key={z} value={z}>
                {z}
              </option>
            ))}
          </Select>
        </Field>
        <Field id="address1" label="Address">
          <Input {...fieldA11y('address1')} placeholder="Street" {...register('addressLines.0')} />
        </Field>
        <Input
          aria-label="Address line 2"
          placeholder="Town or city"
          {...register('addressLines.1')}
        />
      </fieldset>
      <fieldset className="space-y-4">
        <legend className="text-base font-semibold">Head office</legend>
        <Field
          id="headOfficeName"
          label="Name"
          help="The main location. Branches can be added later."
          error={err.headOffice?.name?.message}
        >
          <Input
            {...fieldA11y('headOfficeName', err.headOffice?.name?.message)}
            {...register('headOffice.name')}
          />
        </Field>
      </fieldset>
      <Button type="submit" className="w-full sm:w-auto" disabled={formState.isSubmitting}>
        {formState.isSubmitting ? 'Saving…' : 'Finish setup'}
      </Button>
    </form>
  );
}
