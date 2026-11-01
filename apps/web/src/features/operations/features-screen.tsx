'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { FeatureState, FeatureSwitch } from '@inspower/shared';
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
import { Checkbox } from '@inspower/ui/components/checkbox';
import { Label } from '@inspower/ui/components/label';
import { useStepUp } from '@/features/two-factor/step-up-dialog';
import { api, messageOf } from '@/lib/api';

const states: { value: FeatureState; label: string }[] = [
  { value: 'off', label: 'Off for everyone' },
  { value: 'on', label: 'On for everyone' },
  { value: 'super_admin_only', label: 'Super Admin only' },
  { value: 'selected_users', label: 'Selected people' },
];

/** Administration → Feature switches: registry entries, their state, and the chosen people. Saving asks for step-up. */
export function FeaturesScreen({
  features,
  people,
}: {
  features: FeatureSwitch[];
  people: { id: string; fullName: string; email: string }[];
}) {
  const router = useRouter();
  const withStepUp = useStepUp();
  const [draft, setDraft] = useState<Record<string, { state: FeatureState; userIds: string[] }>>(
    Object.fromEntries(
      features.map((f) => [f.key, { state: f.state, userIds: f.users.map((u) => u.id) }]),
    ),
  );
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  async function save(f: FeatureSwitch) {
    const d = draft[f.key]!;
    setBusy(f.key);
    setError(null);
    setSaved(null);
    try {
      const r = await withStepUp(() => api.put(`/features/${f.key}`, d));
      if (r !== undefined) {
        setSaved(f.key);
        router.refresh();
      }
    } catch (err) {
      setError(messageOf(err));
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        A switch that is off hides its screens and endpoints from everyone, the Super Admin
        included. Switches are declared in code; this screen only sets who sees them.
      </p>
      {error ? (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}
      {features.map((f) => {
        const d = draft[f.key]!;
        const dirty =
          d.state !== f.state ||
          d.userIds.slice().sort().join() !==
            f.users
              .map((u) => u.id)
              .sort()
              .join();
        return (
          <Card key={f.key}>
            <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
              <div>
                <CardTitle className="flex items-center gap-2">
                  {f.label}{' '}
                  <Badge variant={f.state === 'off' ? 'secondary' : 'success'}>
                    {states.find((s) => s.value === f.state)?.label}
                  </Badge>
                </CardTitle>
                <CardDescription>
                  {f.description} <code className="text-xs">{f.key}</code>
                  {f.updatedAt
                    ? ` · changed ${new Date(f.updatedAt).toLocaleString('en-GB')}${f.updatedByName ? ` by ${f.updatedByName}` : ''}`
                    : ''}
                </CardDescription>
              </div>
              <Button size="sm" disabled={!dirty || busy === f.key} onClick={() => save(f)}>
                {saved === f.key && !dirty ? 'Saved' : 'Save'}
              </Button>
            </CardHeader>
            <CardContent className="space-y-3">
              <fieldset className="flex flex-wrap gap-4">
                <legend className="sr-only">State of {f.label}</legend>
                {states.map((s) => (
                  <label key={s.value} className="flex items-center gap-2 text-sm">
                    <input
                      type="radio"
                      name={`state-${f.key}`}
                      value={s.value}
                      checked={d.state === s.value}
                      onChange={() =>
                        setDraft((x) => ({ ...x, [f.key]: { ...x[f.key]!, state: s.value } }))
                      }
                    />
                    {s.label}
                  </label>
                ))}
              </fieldset>
              {d.state === 'selected_users' ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {people.length === 0 ? (
                    <p className="text-sm text-muted-foreground">
                      You need users.read to pick people.
                    </p>
                  ) : null}
                  {people.map((p) => {
                    const id = `${f.key}-${p.id}`;
                    const checked = d.userIds.includes(p.id);
                    return (
                      <div key={p.id} className="flex items-center gap-2">
                        <Checkbox
                          id={id}
                          checked={checked}
                          onChange={(e) =>
                            setDraft((x) => ({
                              ...x,
                              [f.key]: {
                                ...x[f.key]!,
                                userIds: e.target.checked
                                  ? [...x[f.key]!.userIds, p.id]
                                  : x[f.key]!.userIds.filter((u) => u !== p.id),
                              },
                            }))
                          }
                        />
                        <Label htmlFor={id} className="font-normal">
                          {p.fullName} <span className="text-muted-foreground">({p.email})</span>
                        </Label>
                      </div>
                    );
                  })}
                </div>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
