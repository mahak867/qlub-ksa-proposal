import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import type { Request, Response } from 'express';
import { createContainer } from './container';
import { appModule, ErrorFilter } from './http';

/**
 * Vercel serverless entry. The Nest app is created once per warm instance and reused.
 * There is no background timer here: overdue payments are finished when they are read
 * (PaymentService.get → finishOverdue), and /demo/recover-now can sweep the rest.
 */
let handler: ((req: Request, res: Response) => void) | undefined;

async function build() {
  const container = createContainer();
  const app = await NestFactory.create(appModule(container), { logger: ['error', 'warn'] });
  app.enableCors({
    origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','),
    allowedHeaders: ['content-type', 'idempotency-key', 'authorization'],
  });
  app.useGlobalFilters(new ErrorFilter());
  await app.init();
  return app.getHttpAdapter().getInstance();
}

export default async function vercelHandler(req: Request, res: Response) {
  const h = handler ?? (handler = await build());
  return h(req, res);
}
