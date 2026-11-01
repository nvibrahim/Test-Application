import path from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: path.resolve(__dirname, '../../../.env'), override: false, quiet: true });
import { PrismaClient } from '../src/generated/prisma/client';
import { countries, currencies } from './reference-data';

/** Reference data only: countries and currencies. Idempotent. */
async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    for (const c of currencies) {
      await prisma.currency.upsert({ where: { code: c.code }, update: c, create: c });
    }
    for (const c of countries) {
      await prisma.country.upsert({ where: { code: c.code }, update: c, create: c });
    }
    console.log(`Seeded ${currencies.length} currencies and ${countries.length} countries`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
