import { PrismaClient } from '@prisma/client';
import { seed } from './seed';

/** `node dist/seed-cli.js` reseeds; `--if-empty` only seeds a database with no restaurants (used on deploy). */
const db = new PrismaClient();
(async () => {
  if (process.argv.includes('--if-empty') && (await db.restaurant.count()) > 0) {
    console.log('database already has demo data; not reseeding');
    return;
  }
  console.log('seeded', await seed(db));
})().finally(() => db.$disconnect());
