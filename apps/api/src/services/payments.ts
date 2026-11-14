import { createHash } from 'crypto';
import { PaymentState, PrismaClient, PayMethod } from '@prisma/client';
import {
  ACTIVE_STATES,
  computeCharge,
  dinerStatus,
  Gateway,
  PROCESSING_DEADLINE_MS,
  ItemClaim,
} from '@qlub-pay/core';
import { ApiError } from '../errors';
import { claimedUnits, lockBill, SHARE_RESERVATION_MS, Tx } from './bills';
import { InvoiceService } from './invoices';
import { CashbackService } from './cashback';

export interface CreatePaymentInput {
  shareId: string;
  tip: number;
  cashbackUse: number;
  method: PayMethod;
  /** the total the diner saw on screen (share − cashback + tip) */
  expectedTotal: number;
  phone?: string;
}

export function requestHash(body: CreatePaymentInput): string {
  const canonical = JSON.stringify([body.shareId, body.tip, body.cashbackUse, body.method, body.expectedTotal, body.phone ?? null]);
  return createHash('sha256').update(canonical).digest('hex');
}

export class PaymentService {
  constructor(
    private readonly db: PrismaClient,
    private readonly gateway: Gateway,
    private readonly invoices: InvoiceService,
    private readonly cashback: CashbackService,
    private readonly now: () => Date = () => new Date(),
  ) {}

  /**
   * Idempotent create-and-charge. The same key with the same body returns the same
   * result and never charges twice; the same key with a different body is rejected.
   */
  async create(key: string | undefined, body: CreatePaymentInput) {
    if (!key || !/^[A-Za-z0-9-]{16,64}$/.test(key)) throw new ApiError('IDEMPOTENCY_KEY_REQUIRED', 'Idempotency-Key header (16–64 chars) is required');
    const hash = requestHash(body);

    const claimed = await this.claimKey(key, hash);
    if (claimed.replay) return claimed.replay;

    let paymentId: string;
    try {
      paymentId = await this.reserve(key, body);
    } catch (e) {
      // Business rejection: nothing was charged; free the key so the diner can retry.
      await this.db.idempotencyRecord.delete({ where: { key } }).catch(() => undefined);
      throw e;
    }

    const payment = await this.db.payment.findUniqueOrThrow({ where: { id: paymentId } });
    const result = await this.gateway.charge({ reference: key, amount: payment.charge, method: payment.method });
    if (result.status === 'CAPTURED') await this.settleSuccess(paymentId);
    else if (result.status === 'DECLINED') await this.fail(paymentId, 'PROCESSING');
    // PENDING: stays PROCESSING; the recovery job or a webhook will finish it before the deadline.

    const view = await this.get(paymentId);
    await this.db.idempotencyRecord.update({ where: { key }, data: { statusCode: 201, responseBody: view as object } });
    return view;
  }

  private async claimKey(key: string, hash: string): Promise<{ replay?: unknown }> {
    try {
      await this.db.idempotencyRecord.create({ data: { key, requestHash: hash } });
      return {};
    } catch {
      const rec = await this.db.idempotencyRecord.findUnique({ where: { key } });
      if (!rec) return this.claimKey(key, hash);
      if (rec.requestHash !== hash) throw new ApiError('IDEMPOTENCY_MISMATCH', 'this Idempotency-Key was used with a different request');
      if (rec.responseBody) {
        // Return the CURRENT state of the same payment, so a retry after a timeout sees progress.
        const stored = rec.responseBody as { id?: string };
        return { replay: stored.id ? await this.get(stored.id) : rec.responseBody };
      }
      throw new ApiError('PAYMENT_IN_PROGRESS', 'this payment request is already being processed');
    }
  }

  /** Validate and create the PROCESSING payment inside one locked transaction. */
  private async reserve(key: string, body: CreatePaymentInput): Promise<string> {
    return this.db.$transaction(async (tx) => {
      const share = await tx.share.findUnique({ where: { id: body.shareId }, include: { bill: { include: { table: { include: { branch: true } } } } } });
      if (!share) throw new ApiError('NOT_FOUND', 'share not found');
      await lockBill(tx, share.billId);
      const fresh = await tx.share.findUniqueOrThrow({ where: { id: share.id }, include: { payments: true } });
      if (fresh.status !== 'RESERVED') throw new ApiError('SHARE_UNAVAILABLE', fresh.status === 'PAID' ? 'this share is already paid' : 'this share was released; choose again');
      if (fresh.payments.some((p) => ACTIVE_STATES.has(p.state))) {
        throw new ApiError('PAYMENT_IN_PROGRESS', 'a payment for this share is still being checked (at most 90 seconds)');
      }

      const branch = share.bill.table.branch;
      if (body.cashbackUse > 0) {
        if (!branch.acceptsCashback) throw new ApiError('CASHBACK_UNAVAILABLE', 'this branch does not accept cashback');
        if (!body.phone) throw new ApiError('CASHBACK_UNAVAILABLE', 'sign in to use cashback');
        const balance = await this.cashback.balance(body.phone, tx);
        if (body.cashbackUse > balance) throw new ApiError('CASHBACK_UNAVAILABLE', 'not enough cashback balance');
      }

      let breakdown;
      try {
        breakdown = computeCharge(fresh.amount, body.tip, body.cashbackUse);
      } catch (e) {
        throw new ApiError('VALIDATION', (e as Error).message);
      }
      if (breakdown.charge !== body.expectedTotal) {
        throw new ApiError('TOTAL_CHANGED', 'the total changed; please review it again before paying', breakdown);
      }

      const p = await tx.payment.create({
        data: {
          shareId: fresh.id,
          amount: fresh.amount,
          tip: body.tip,
          cashbackUsed: body.cashbackUse,
          charge: breakdown.charge,
          phone: body.phone,
          method: body.method,
          state: 'PROCESSING',
          gatewayRef: key,
          deadlineAt: new Date(this.now().getTime() + PROCESSING_DEADLINE_MS),
        },
      });
      await tx.event.create({ data: { name: 'payment_started', billId: share.billId, paymentId: p.id, props: { tip: body.tip, cashback: body.cashbackUse } } });
      return p.id;
    });
  }

  /**
   * The gateway captured money for this payment. Accept it if its share can still be
   * paid; otherwise mark it for refund. Never keep money without a paid share.
   */
  async settleSuccess(paymentId: string): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const p0 = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { share: true } });
      await lockBill(tx, p0.share.billId);
      const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { share: { include: { bill: { include: { shares: true, items: true } } } } } });
      if (!['PROCESSING', 'FAILED', 'EXPIRED'].includes(p.state)) return; // already settled

      const share = p.share;
      let accept = false;
      if (share.status === 'RESERVED') accept = true;
      else if (share.status === 'RELEASED') accept = canReclaim(share, share.bill);
      // PAID (another attempt on the same share won) → refund.

      if (accept) {
        const ok = await cas(tx, p.id, p.state, 'SUCCEEDED');
        if (!ok) return;
        await tx.share.update({ where: { id: share.id }, data: { status: 'PAID' } });
        await this.cashback.onPaymentSucceeded(tx, p, share.bill.tableId);
        await tx.event.create({ data: { name: 'payment_succeeded', billId: share.billId, paymentId: p.id, props: { late: p.state !== 'PROCESSING' } } });
        const paidSum = share.bill.shares.filter((s) => s.status === 'PAID' && s.id !== share.id).reduce((a, s) => a + s.amount, 0) + share.amount;
        if (paidSum === share.bill.total) {
          await tx.bill.update({ where: { id: share.billId }, data: { status: 'PAID' } });
          await this.invoices.issue(tx, share.billId, this.now());
          await tx.event.create({ data: { name: 'bill_paid', billId: share.billId } });
        }
      } else {
        const ok = await cas(tx, p.id, p.state, 'REFUND_DUE');
        if (ok) await tx.event.create({ data: { name: 'refund_due', billId: share.billId, paymentId: p.id } });
      }
    });
  }

  async fail(paymentId: string, from: PaymentState): Promise<void> {
    await this.db.$transaction(async (tx) => {
      const ok = await cas(tx, paymentId, from, 'FAILED');
      if (ok) {
        const p = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include: { share: true } });
        await tx.event.create({ data: { name: 'payment_failed', billId: p.share.billId, paymentId } });
      }
    });
  }

  /** Webhook from the gateway: look the payment up by reference and settle it. */
  async onGatewayCallback(reference: string): Promise<{ handled: boolean }> {
    const p = await this.db.payment.findUnique({ where: { gatewayRef: reference } });
    if (!p) return { handled: false };
    const status = await this.gateway.status(reference); // never trust the callback body alone
    if (status === 'CAPTURED') await this.settleSuccess(p.id);
    else if (status === 'DECLINED' && p.state === 'PROCESSING') await this.fail(p.id, 'PROCESSING');
    return { handled: true };
  }

  /**
   * Recovery job (§5.4). Runs every 15s:
   *  - PROCESSING past deadline → ask the gateway; captured → settle, otherwise EXPIRED
   *  - REFUND_DUE → refund (mock) → REFUNDED
   *  - RESERVED shares with no active payment older than the reservation window → RELEASED
   */
  async recover(): Promise<{ expired: number; settled: number; refunded: number; released: number }> {
    const now = this.now();
    let expired = 0, settled = 0, refunded = 0, released = 0;

    const overdue = await this.db.payment.findMany({ where: { state: 'PROCESSING', deadlineAt: { lt: now } } });
    for (const p of overdue) {
      const status = await this.gateway.status(p.gatewayRef);
      if (status === 'CAPTURED') {
        await this.settleSuccess(p.id);
        settled++;
        continue;
      }
      const did = await this.db.$transaction(async (tx) => {
        const share = await tx.share.findUniqueOrThrow({ where: { id: p.shareId } });
        await lockBill(tx, share.billId);
        const ok = await cas(tx, p.id, 'PROCESSING', 'EXPIRED');
        if (ok) {
          await tx.share.updateMany({ where: { id: p.shareId, status: 'RESERVED' }, data: { status: 'RELEASED' } });
          await tx.event.create({ data: { name: 'payment_expired', billId: share.billId, paymentId: p.id } });
        }
        return ok;
      });
      if (did) expired++;
    }

    const due = await this.db.payment.findMany({ where: { state: 'REFUND_DUE' } });
    for (const p of due) {
      // Mock refund: a real gateway call would go here, keyed by the payment reference.
      const ok = await this.db.$transaction((tx) => cas(tx, p.id, 'REFUND_DUE', 'REFUNDED'));
      if (ok) refunded++;
    }

    const stale = await this.db.share.findMany({
      where: { status: 'RESERVED', createdAt: { lt: new Date(now.getTime() - SHARE_RESERVATION_MS) } },
      include: { payments: true },
    });
    for (const s of stale) {
      if (s.payments.some((p) => ACTIVE_STATES.has(p.state))) continue;
      const r = await this.db.share.updateMany({ where: { id: s.id, status: 'RESERVED' }, data: { status: 'RELEASED' } });
      released += r.count;
    }
    return { expired, settled, refunded, released };
  }

  async get(paymentId: string) {
    const p = await this.db.payment.findUnique({ where: { id: paymentId }, include: { share: { include: { bill: { include: { invoice: true, table: true } } } } } });
    if (!p) throw new ApiError('NOT_FOUND', 'payment not found');
    return {
      id: p.id,
      state: p.state,
      status: dinerStatus(p.state),
      amount: p.amount,
      tip: p.tip,
      cashbackUsed: p.cashbackUsed,
      charge: p.charge,
      method: p.method,
      reference: p.gatewayRef.slice(0, 8).toUpperCase(),
      deadlineAt: p.deadlineAt.toISOString(),
      billId: p.share.billId,
      billPaid: p.share.bill.status === 'PAID',
      invoiceNumber: p.share.bill.invoice?.number ?? null,
      tableToken: p.share.bill.table.token,
      /** where "try again" should go: the same share if it is still held, otherwise choose again */
      retry: p.state === 'FAILED' && p.share.status === 'RESERVED' ? 'REVIEW' : 'SPLIT',
    };
  }
}

/** Compare-and-set: the transition happens only if the payment is still in `from`. */
async function cas(tx: Tx, id: string, from: PaymentState, to: PaymentState): Promise<boolean> {
  const r = await tx.payment.updateMany({ where: { id, state: from }, data: { state: to } });
  return r.count === 1;
}

function canReclaim(
  share: { id: string; amount: number; mode: string; itemClaims: unknown },
  bill: { total: number; status: string; shares: { id: string; amount: number; mode: any; itemClaims: any; status: any }[]; items: { id: string; quantity: number }[] },
): boolean {
  if (bill.status !== 'OPEN') return false;
  const others = bill.shares.filter((s) => s.id !== share.id && s.status !== 'RELEASED');
  const remaining = bill.total - others.reduce((a, s) => a + s.amount, 0);
  if (share.amount > remaining) return false;
  if (share.mode === 'ITEMS' && share.itemClaims) {
    const used = claimedUnits(others);
    for (const c of share.itemClaims as ItemClaim[]) {
      const item = bill.items.find((i) => i.id === c.itemId);
      if (!item || c.quantity > item.quantity - (used.get(c.itemId) ?? 0)) return false;
    }
  }
  return true;
}
