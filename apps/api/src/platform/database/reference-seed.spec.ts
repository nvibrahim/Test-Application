import { describe, expect, it } from 'vitest';
import { countries, currencies } from './reference-data';
import { seedReferenceData } from './reference-seed';

function fakeClient() {
  const calls: string[] = [];
  const table = (name: string) => ({
    upsert: async ({ where }: { where: { code: string } }) => {
      calls.push(`${name}:${where.code}`);
      return {};
    },
  });
  return { calls, client: { currency: table('currency'), country: table('country') } };
}

describe('seedReferenceData', () => {
  it('upserts every currency, then every country', async () => {
    const { calls, client } = fakeClient();
    const seeded = await seedReferenceData(client as never);

    expect(seeded).toEqual({ currencies: currencies.length, countries: countries.length });
    expect(calls).toHaveLength(currencies.length + countries.length);
    const firstCountry = calls.findIndex((call) => call.startsWith('country:'));
    expect(calls.slice(0, firstCountry).every((call) => call.startsWith('currency:'))).toBe(true);
    expect(firstCountry).toBe(currencies.length);
  });

  it('includes the currencies the countries refer to', () => {
    const codes = new Set(currencies.map((c) => c.code));
    for (const country of countries) {
      if (country.currencyCode) expect(codes).toContain(country.currencyCode);
    }
  });
});
