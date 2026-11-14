import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import { createContainer } from './container';
import { appModule, ErrorFilter } from './http';
import { seed } from './seed';

async function main() {
  const container = createContainer();
  if (process.env.SEED_ON_START === '1') await seed(container.db);
  const app = await NestFactory.create(appModule(container), { logger: ['error', 'warn', 'log'] });
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    allowedHeaders: ['content-type', 'idempotency-key', 'authorization'],
  });
  app.useGlobalFilters(new ErrorFilter());
  app.enableShutdownHooks();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  console.log(`api listening on :${port}`);
}

main();
