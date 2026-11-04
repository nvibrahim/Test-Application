import path from 'node:path';
import { config } from 'dotenv';
import { PrismaPg } from '@prisma/adapter-pg';

config({ path: path.resolve(__dirname, '../../../.env'), override: false, quiet: true });
import { PrismaClient } from '../src/generated/prisma/client';
import { seedReferenceData } from '../src/platform/database/reference-seed';

/** Reference data only: countries and currencies. Idempotent. */
async function main(): Promise<void> {
  const url = process.env['DATABASE_URL'];
  if (!url) throw new Error('DATABASE_URL is not set');
  const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
  try {
    const seeded = await seedReferenceData(prisma);
    console.log(`Seeded ${seeded.currencies} currencies and ${seeded.countries} countries`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
