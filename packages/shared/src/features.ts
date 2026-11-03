import { z } from 'zod';

/**
 * Feature switches are declared here, in code, like permissions and scheduled jobs. A switch
 * with no row is off. States: off (nobody, the Super Admin included), on (everyone),
 * super_admin_only, selected_users. Modules add their own entries; the screen shows them all.
 */
export interface FeatureSwitchDefinition {
  key: string;
  label: string;
  description: string;
  module: string;
}

export const featureSwitchRegistry: readonly FeatureSwitchDefinition[] = [
  {
    key: 'design_system',
    label: 'Design system page',
    description: 'The component gallery at /design-system, for people checking the look and feel.',
    module: 'core',
  },
  {
    key: 'exports',
    label: 'Data exports',
    description: 'CSV exports from the audit log and, later, from module screens.',
    module: 'core',
  },
];

export const featureKeys = featureSwitchRegistry.map((f) => f.key);
export const featureKeyPattern = /^[a-z][a-z0-9_]*$/;

export const featureStateSchema = z.enum(['off', 'on', 'super_admin_only', 'selected_users']);
export type FeatureState = z.infer<typeof featureStateSchema>;

export const featureSwitchSchema = z.object({
  key: z.string(),
  label: z.string(),
  description: z.string(),
  module: z.string(),
  state: featureStateSchema,
  users: z.array(z.object({ id: z.string().uuid(), fullName: z.string(), email: z.string() })),
  updatedAt: z.string().datetime().nullable(),
  updatedByName: z.string().nullable(),
});
export type FeatureSwitch = z.infer<typeof featureSwitchSchema>;
export const featureSwitchesResponseSchema = z.object({ features: z.array(featureSwitchSchema) });

export const featureSwitchUpdateSchema = z.object({
  state: featureStateSchema,
  /** Only read when the state is selected_users */
  userIds: z.array(z.string().uuid()).max(500).default([]),
});

/** Pure: who sees a feature in a given state. */
export function featureVisible(
  state: FeatureState | undefined,
  viewer: { isSuperAdmin: boolean; selected: boolean },
): boolean {
  switch (state) {
    case 'on':
      return true;
    case 'super_admin_only':
      return viewer.isSuperAdmin;
    case 'selected_users':
      return viewer.isSuperAdmin || viewer.selected;
    default:
      return false;
  }
}

/** The switched-on features for the signed-in person, so pages can hide what the API hides. */
export const myFeaturesSchema = z.object({ features: z.array(z.string()) });
