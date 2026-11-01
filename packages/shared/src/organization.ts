import { z } from 'zod';

export const organizationProfileSchema = z.object({
  id: z.string().uuid(),
  legalName: z.string(),
  tradingName: z.string().nullable(),
  countryCode: z.string().nullable(),
  currencyCode: z.string().nullable(),
  timeZone: z.string(),
  dateFormat: z.string(),
  numberFormat: z.string(),
  weekStartsOn: z.number().int(),
  addressLines: z.array(z.string()),
  documentFooter: z.string().nullable(),
  setupCompletedAt: z.string().datetime().nullable(),
  version: z.number().int(),
});
export type OrganizationProfile = z.infer<typeof organizationProfileSchema>;

export const updateOrganizationSchema = z.object({
  legalName: z.string().trim().min(1).max(200).optional(),
  tradingName: z.string().trim().max(200).nullable().optional(),
  countryCode: z.string().length(2).toUpperCase().optional(),
  currencyCode: z.string().length(3).toUpperCase().optional(),
  timeZone: z.string().min(1).max(64).optional(),
  addressLines: z.array(z.string().trim().max(200)).max(6).optional(),
  documentFooter: z.string().trim().max(500).nullable().optional(),
  version: z.number().int(),
});
/** Fields whose change asks for step-up. */
export const sensitiveOrganizationFields = ['legalName', 'countryCode', 'currencyCode'] as const;

export const locationSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  isHeadOffice: z.boolean(),
  isActive: z.boolean(),
  timeZone: z.string().nullable(),
  addressLines: z.array(z.string()),
  managerUserId: z.string().uuid().nullable(),
  managerName: z.string().nullable(),
  version: z.number().int(),
});
export type Location = z.infer<typeof locationSchema>;
export const locationListSchema = z.object({ locations: z.array(locationSchema) });

export const createLocationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  timeZone: z.string().max(64).nullable().default(null),
  addressLines: z.array(z.string().trim().max(200)).max(6).default([]),
  managerUserId: z.string().uuid().nullable().default(null),
});
export const updateLocationSchema = createLocationSchema.partial().extend({
  isActive: z.boolean().optional(),
  version: z.number().int(),
});
