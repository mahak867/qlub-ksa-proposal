import { PrismaClient } from '@prisma/client';
import { seed } from './seed';

const db = new PrismaClient();
seed(db)
  .then((r) => console.log('seeded', r))
  .finally(() => db.$disconnect());
