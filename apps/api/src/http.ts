import 'reflect-metadata';
import {
  ArgumentsHost,
  Body,
  Catch,
  Controller,
  Delete,
  ExceptionFilter,
  Get,
  Headers,
  HttpCode,
  HttpException,
  Inject,
  Module,
  OnModuleDestroy,
  OnModuleInit,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { z } from 'zod';
import { ApiError } from './errors';
import { Container } from './container';
import { DEMO_PHONE, seed } from './seed';
import { DEMO_OTP } from './services/memberships';

export const CONTAINER = 'CONTAINER';

function parse<S extends z.ZodTypeAny>(schema: S, data: unknown): z.output<S> {
  const r = schema.safeParse(data);
  if (!r.success) throw new ApiError('VALIDATION', 'invalid request', r.error.flatten());
  return r.data;
}

const halalas = z.number().int().min(0).max(10_000_000);
const phone = z.string().regex(/^\+9665\d{8}$/, 'Saudi mobile in +9665XXXXXXXX format');

const ShareBody = z.object({
  mode: z.enum(['WHOLE', 'ITEMS', 'EQUAL', 'CUSTOM']),
  people: z.number().int().min(1).max(50).optional(),
  items: z.array(z.object({ itemId: z.string(), quantity: z.number().int().min(1) })).optional(),
  amount: halalas.optional(),
});

/** Note: no membership field exists on this body. Paying can never enrol anyone (P2). */
const PaymentBody = z
  .object({
    shareId: z.string(),
    tip: halalas,
    cashbackUse: halalas.default(0),
    method: z.enum(['MADA', 'APPLE_PAY']),
    expectedTotal: halalas,
    phone: phone.optional(),
  })
  .strict();

const JoinBody = z.object({
  phone,
  otp: z.string(),
  consent: z.boolean(),
  textVersion: z.string(),
  locale: z.enum(['ar', 'en']),
  paymentId: z.string().optional(),
});

@Controller()
class ApiController {
  constructor(@Inject(CONTAINER) private readonly c: Container) {}

  @Get('health')
  health() {
    return { ok: true, demo: { phone: DEMO_PHONE, otp: DEMO_OTP } };
  }

  @Get('tables/:token/bill')
  async bill(@Param('token') token: string) {
    const view = await this.c.bills.getByToken(token);
    await this.c.db.event.create({ data: { name: 'bill_viewed', billId: view.id } });
    return view;
  }

  @Post('bills/:id/shares')
  createShare(@Param('id') id: string, @Body() body: unknown) {
    return this.c.bills.createShare(id, parse(ShareBody, body));
  }

  @Delete('shares/:id')
  releaseShare(@Param('id') id: string) {
    return this.c.bills.releaseShare(id);
  }

  @Post('payments')
  createPayment(@Headers('idempotency-key') key: string | undefined, @Body() body: unknown) {
    return this.c.payments.create(key, parse(PaymentBody, body));
  }

  @Get('payments/:id')
  payment(@Param('id') id: string) {
    return this.c.payments.get(id);
  }

  @Post('gateway/webhook')
  @HttpCode(200)
  webhook(@Body() body: unknown) {
    const { reference } = parse(z.object({ reference: z.string() }), body);
    return this.c.payments.onGatewayCallback(reference);
  }

  @Get('bills/:id/invoice')
  invoice(@Param('id') id: string) {
    return this.c.invoices.forBill(id);
  }

  @Get('memberships/terms')
  terms(@Query('locale') locale: string) {
    return this.c.memberships.terms(locale === 'en' ? 'en' : 'ar');
  }

  @Post('memberships')
  join(@Body() body: unknown) {
    return this.c.memberships.join(parse(JoinBody, body));
  }

  @Get('memberships/:id')
  membership(@Param('id') id: string) {
    return this.c.memberships.view(id);
  }

  @Delete('memberships/:id')
  cancel(@Param('id') id: string) {
    return this.c.memberships.cancel(id);
  }

  @Get('cashback')
  wallet(@Query('phone') p: string) {
    return this.c.cashback.wallet(parse(phone, p));
  }

  @Get('cashback/branches')
  branches(@Query('city') city?: string) {
    return this.c.cashback.branches(city || undefined);
  }

  @Get('merchant/branches/:id/overview')
  overview(@Param('id') id: string) {
    return this.c.merchant.overview(id);
  }

  @Get('merchant/branches/:id/sync-health')
  syncHealth(@Param('id') id: string) {
    return this.c.merchant.syncHealth(id);
  }

  @Get('demo/info')
  async demoInfo() {
    const t = await this.c.db.table.findFirst({ where: { label: '12' }, include: { branch: true } });
    return { token: t?.token, branchId: t?.branchId, gatewayMode: this.c.gateway.mode, phone: DEMO_PHONE, otp: DEMO_OTP };
  }

  @Post('demo/gateway-mode')
  @HttpCode(200)
  mode(@Body() body: unknown) {
    const { mode } = parse(z.object({ mode: z.enum(['APPROVE', 'DECLINE', 'HANG', 'LATE_SUCCESS']) }), body);
    this.c.gateway.mode = mode;
    return { mode };
  }

  /** Simulate the bank finally confirming a pending charge, then the gateway calling us back. */
  @Post('demo/payments/:id/settle-late')
  @HttpCode(200)
  async settleLate(@Param('id') id: string) {
    const p = await this.c.db.payment.findUnique({ where: { id } });
    if (!p) throw new ApiError('NOT_FOUND', 'payment not found');
    this.c.gateway.settleLate(p.gatewayRef);
    await this.c.payments.onGatewayCallback(p.gatewayRef);
    return this.c.payments.get(id);
  }

  /** Run the recovery job now, pretending the 90-second deadline has passed for every payment. */
  @Post('demo/recover-now')
  @HttpCode(200)
  async recoverNow() {
    await this.c.db.payment.updateMany({ where: { state: 'PROCESSING' }, data: { deadlineAt: new Date(Date.now() - 1000) } });
    return this.c.payments.recover();
  }

  @Post('demo/reset')
  @HttpCode(200)
  async reset() {
    this.c.gateway.mode = 'APPROVE';
    this.c.gateway.charges.clear();
    return seed(this.c.db);
  }
}

@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse();
    if (err instanceof ApiError) return res.status(err.status).json(err.toJSON());
    if (err instanceof HttpException) return res.status(err.getStatus()).json({ code: 'HTTP', message: err.message, details: null });
    console.error(err);
    return res.status(500).json({ code: 'INTERNAL', message: 'something went wrong', details: null });
  }
}

export function appModule(container: Container) {
  @Module({ controllers: [ApiController], providers: [{ provide: CONTAINER, useValue: container }] })
  class AppModule implements OnModuleInit, OnModuleDestroy {
    timer?: NodeJS.Timeout;
    onModuleInit() {
      // Recovery job (§5.4): every 15 seconds.
      this.timer = setInterval(() => container.payments.recover().catch((e) => console.error('recovery failed', e)), 15_000);
    }
    async onModuleDestroy() {
      if (this.timer) clearInterval(this.timer);
      await container.db.$disconnect();
    }
  }
  return AppModule;
}
