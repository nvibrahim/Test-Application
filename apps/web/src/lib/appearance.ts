import 'server-only';
import { z } from 'zod';
import { appearanceSettingsSchema } from '@inspower/shared';
import { apiServer } from './api';

export const appearanceResponseSchema = z.object({
  settings: appearanceSettingsSchema,
  theme: z.object({
    brand: z.string(),
    adjusted: z.boolean(),
    light: z.record(z.string(), z.string()),
    dark: z.record(z.string(), z.string()),
    attributes: z.record(z.string(), z.string()),
  }),
  css: z.string(),
  assets: z.record(z.string(), z.string()),
});
export type AppearanceResponse = z.infer<typeof appearanceResponseSchema>;

/** The computed theme, brand pictures and look choices; read on every request, cached by the API. */
export async function appearance(): Promise<AppearanceResponse> {
  try {
    return await apiServer('/appearance', appearanceResponseSchema);
  } catch {
    return {
      settings: appearanceSettingsSchema.parse({}),
      theme: { brand: '#1d4ed8', adjusted: false, light: {}, dark: {}, attributes: {} },
      css: '',
      assets: {},
    };
  }
}
