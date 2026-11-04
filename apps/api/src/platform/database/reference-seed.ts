import type { PrismaClient } from '../../generated/prisma/client';
import { countries, currencies } from './reference-data';

type ReferenceDataClient = Pick<PrismaClient, 'country' | 'currency'>;

/**
 * Upserts the countries and currencies the app offers, so running it again only refreshes them.
 * Currencies go first because countries refer to them. The image's migrate role runs this after
 * the migrations, so every new client and every release has the lists.
 */
export async function seedReferenceData(
  prisma: ReferenceDataClient,
): Promise<{ currencies: number; countries: number }> {
  for (const c of currencies) {
    await prisma.currency.upsert({ where: { code: c.code }, update: c, create: c });
  }
  for (const c of countries) {
    await prisma.country.upsert({ where: { code: c.code }, update: c, create: c });
  }
  return { currencies: currencies.length, countries: countries.length };
}
