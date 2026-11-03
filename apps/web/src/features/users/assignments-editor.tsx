'use client';

import { Plus, Trash2 } from 'lucide-react';
import type { Role } from '@inspower/shared';
import { Button } from '@inspower/ui/components/button';
import { Select } from '@inspower/ui/components/select';

export interface AssignmentDraft {
  roleId: string;
  locationId: string | null;
}
export interface LocationOption {
  id: string;
  name: string;
}

/** Rows of role + location ("Every location" by default). The Super Admin role is never offered here. */
export function AssignmentsEditor({
  value,
  onChange,
  roles,
  locations,
  disabled,
}: {
  value: AssignmentDraft[];
  onChange: (v: AssignmentDraft[]) => void;
  roles: Role[];
  locations: LocationOption[];
  disabled?: boolean;
}) {
  const options = roles.filter((r) => !r.isFixed);
  function update(i: number, patch: Partial<AssignmentDraft>) {
    onChange(value.map((a, idx) => (idx === i ? { ...a, ...patch } : a)));
  }
  return (
    <div className="space-y-2">
      {value.map((a, i) => (
        <div key={i} className="grid grid-cols-[1fr_1fr_auto] items-center gap-2">
          <Select
            aria-label={`Role ${i + 1}`}
            value={a.roleId}
            onChange={(e) => update(i, { roleId: e.target.value })}
            disabled={disabled}
          >
            {options.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </Select>
          <Select
            aria-label={`Location for role ${i + 1}`}
            value={a.locationId ?? ''}
            onChange={(e) => update(i, { locationId: e.target.value || null })}
            disabled={disabled}
          >
            <option value="">Every location</option>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`Remove role ${i + 1}`}
            disabled={disabled || value.length <= 1}
            onClick={() => onChange(value.filter((_, idx) => idx !== i))}
          >
            <Trash2 className="size-4" aria-hidden="true" />
          </Button>
        </div>
      ))}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={disabled || !options.length}
        onClick={() => onChange([...value, { roleId: options[0]!.id, locationId: null }])}
      >
        <Plus className="size-4" aria-hidden="true" /> Add a role
      </Button>
    </div>
  );
}
