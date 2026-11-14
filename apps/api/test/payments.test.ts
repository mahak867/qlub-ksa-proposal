import { beforeEach, describe, expect, it, afterAll } from 'vitest';
import { randomUUID } from 'crypto';
import { Prisma, PrismaClient } from '@prisma/client';
import { createContainer, Container } from '../src/container';
import { seed, DEMO_TABLE_TOKEN, DEMO_PHONE } from '../src/seed';
import { MEMBERSHIP_TERMS, DEMO_OTP } from '../src/services/memberships';
import { decodeTlv } from '@qlub-pay/core';

const db = new PrismaClient();
let clock = new Date('2026-11-14T18:00:00Z');
let c: Container;
const key = () => randomUUID();

beforeEach(async () => {
  clock = new Date('2026-11-14T18:00:00Z');
  c = createContainer(db, () => clock);
  await seed(db);
});
afterAll(() => db.$disconnect());

async function bill() {
  return c.bills.getByToken(DEMO_TABLE_TOKEN);
}

describe('splitting', () => {
  it('equal split of 220.00 between 3 sums exactly to the bill', async () => {
    const b = await bill();
    const shares = [];
    for (let i = 0; i < 3; i++) shares.push(await c.bills.createShare(b.id, { mode: 'EQUAL', people: 3 }));
    expect(shares.map((s) => s.amount)).toEqual([7334, 7333, 7333]);
    await expect(c.bills.createShare(b.id, { mode: 'EQUAL', people: 3 })).rejects.toMatchObject({ code: 'SHARE_UNAVAILABLE' });
  });

  it('two diners racing for the last unit of an item: exactly one wins', async () => {
    const b = await bill();
    const hummus = b.items.find((i) => i.nameEn === 'Hummus')!;
    const results = await Promise.allSettled([
      c.bills.createShare(b.id, { mode: 'ITEMS', items: [{ itemId: hummus.id, quantity: 1 }] }),
      c.bills.createShare(b.id, { mode: 'ITEMS', items: [{ itemId: hummus.id, quantity: 1 }] }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((r) => r.status === 'rejected')).toHaveLength(1);
  });

  it('mixing split modes is refused, but "pay the rest" always works', async () => {
    const b = await bill();
    await c.bills.createShare(b.id, { mode: 'CUSTOM', amount: 5000 });
    await expect(c.bills.createShare(b.id, { mode: 'EQUAL', people: 2 })).rejects.toMatchObject({ code: 'INVALID_SPLIT' });
    const rest = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    expect(rest.amount).toBe(b.total - 5000);
  });
});

describe('P1: the reviewed total is the charged total', () => {
  it('rejects a tampered expectedTotal and charges nothing', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    await expect(c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount - 1 })).rejects.toMatchObject({
      code: 'TOTAL_CHANGED',
    });
    expect(c.gateway.chargeCalls).toBe(0);
    expect(await db.payment.count()).toBe(0);
  });
});

describe('P3: idempotency and no double charge', () => {
  it('same key twice: one payment, one gateway call', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    const k = key();
    const body = { shareId: s.id, tip: 1000, cashbackUse: 0, method: 'MADA' as const, expectedTotal: s.amount + 1000 };
    const first = await c.payments.create(k, body);
    const second = await c.payments.create(k, body);
    expect(second.id).toBe(first.id);
    expect(first.status).toBe('PAID');
    expect(c.gateway.chargeCalls).toBe(1);
    expect(await db.payment.count()).toBe(1);
  });

  it('same key with a different body is rejected', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    const k = key();
    await c.payments.create(k, { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount });
    await expect(c.payments.create(k, { shareId: s.id, tip: 500, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount + 500 })).rejects.toMatchObject({
      code: 'IDEMPOTENCY_MISMATCH',
    });
  });

  it('a second attempt on the same share is blocked only while the first is in flight', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    c.gateway.mode = 'HANG';
    const p1 = await c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount });
    expect(p1.status).toBe('CHECKING');
    await expect(c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount })).rejects.toMatchObject({
      code: 'PAYMENT_IN_PROGRESS',
    });
  });
});

describe('P3: nothing stays "ongoing"', () => {
  it('a hung payment expires at the deadline, releases its share, and the diner can retry at once', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    c.gateway.mode = 'HANG';
    const p1 = await c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount });

    clock = new Date(clock.getTime() + 60_000);
    expect((await c.payments.recover()).expired).toBe(0); // not yet

    clock = new Date(clock.getTime() + 31_000);
    expect((await c.payments.recover()).expired).toBe(1);
    expect((await c.payments.get(p1.id)).status).toBe('NOT_CHARGED');

    c.gateway.mode = 'APPROVE';
    const s2 = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    const p2 = await c.payments.create(key(), { shareId: s2.id, tip: 0, cashbackUse: 0, method: 'APPLE_PAY', expectedTotal: s2.amount });
    expect(p2.status).toBe('PAID');
    expect(p2.billPaid).toBe(true);
  });

  it('a payment captured just before the deadline is settled, not expired', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    c.gateway.mode = 'LATE_SUCCESS';
    const p = await c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount });
    const row = await db.payment.findUniqueOrThrow({ where: { id: p.id } });
    c.gateway.settleLate(row.gatewayRef);
    clock = new Date(clock.getTime() + 91_000);
    expect((await c.payments.recover()).settled).toBe(1);
    expect((await c.payments.get(p.id)).status).toBe('PAID');
  });
});

describe('P3: late success never keeps money without a paid share', () => {
  async function expiredPayment() {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    c.gateway.mode = 'LATE_SUCCESS';
    const p = await c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount });
    clock = new Date(clock.getTime() + 91_000);
    await c.payments.recover();
    expect((await c.payments.get(p.id)).state).toBe('EXPIRED');
    return { b, p, ref: (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).gatewayRef };
  }

  it('share still free: the late success is accepted', async () => {
    const { p, ref } = await expiredPayment();
    c.gateway.settleLate(ref);
    await c.payments.onGatewayCallback(ref);
    const v = await c.payments.get(p.id);
    expect(v.status).toBe('PAID');
    expect(v.billPaid).toBe(true);
  });

  it('someone else paid meanwhile: a refund is created and completed', async () => {
    const { b, p, ref } = await expiredPayment();
    c.gateway.mode = 'APPROVE';
    const s2 = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    await c.payments.create(key(), { shareId: s2.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s2.amount });

    c.gateway.settleLate(ref);
    await c.payments.onGatewayCallback(ref);
    expect((await c.payments.get(p.id)).status).toBe('REFUND_ON_ITS_WAY');
    expect((await c.payments.recover()).refunded).toBe(1);
    expect((await c.payments.get(p.id)).status).toBe('REFUNDED');
  });
});

describe('invoice', () => {
  it('one invoice per bill after all split payments, with a decodable QR', async () => {
    const b = await bill();
    const s1 = await c.bills.createShare(b.id, { mode: 'EQUAL', people: 2 });
    const s2 = await c.bills.createShare(b.id, { mode: 'EQUAL', people: 2 });
    await c.payments.create(key(), { shareId: s1.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s1.amount });
    await expect(c.invoices.forBill(b.id)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    await c.payments.create(key(), { shareId: s2.id, tip: 2000, cashbackUse: 0, method: 'MADA', expectedTotal: s2.amount + 2000 });
    const inv = await c.invoices.forBill(b.id);
    expect(inv.total).toBe(b.total); // tips are not on the invoice
    expect(inv.vat + inv.net).toBe(inv.total);
    const tags = decodeTlv(inv.qrBase64);
    expect(tags[0].bytes.toString('utf8')).toBe('بيت السفرة');
    expect(tags[3].bytes.toString()).toBe('220.00');
    expect(await db.invoice.count()).toBe(1);
  });
});

describe('P2: paying never enrols anyone', () => {
  it('a successful payment creates no membership', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    await c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount, phone: DEMO_PHONE });
    expect(await db.membership.count()).toBe(0);
  });

  it('joining needs an explicit yes on the current terms; cancel is immediate', async () => {
    const base = { phone: DEMO_PHONE, otp: DEMO_OTP, textVersion: MEMBERSHIP_TERMS.version, locale: 'ar' as const };
    await expect(c.memberships.join({ ...base, consent: false })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    await expect(c.memberships.join({ ...base, consent: true, textVersion: 'old' })).rejects.toMatchObject({ code: 'CONSENT_REQUIRED' });
    const m = await c.memberships.join({ ...base, consent: true });
    expect(m.consent?.text).toContain('إلغاء');
    expect(await db.notification.count()).toBe(1);
    const cancelled = await c.memberships.cancel(m.id);
    expect(cancelled.status).toBe('CANCELLED');
    expect(cancelled.nextChargeAt).toBeNull();
    expect(await db.notification.count()).toBe(0);
  });
});

describe('P4: cashback', () => {
  it('is refused at a branch that does not accept it, and used where it does', async () => {
    const b = await bill(); // Riyadh branch accepts cashback
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    const p = await c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 2500, method: 'MADA', expectedTotal: s.amount - 2500, phone: DEMO_PHONE });
    expect(p.charge).toBe(s.amount - 2500);
    expect(await c.cashback.balance(DEMO_PHONE)).toBe(Math.floor((s.amount * 3) / 100)); // 25.00 spent, 3% earned

    const jeddahTable = await db.table.findFirstOrThrow({ where: { label: '3' } });
    const { newBill } = await import('../src/seed');
    const jb = await newBill(db, jeddahTable.id);
    const js = await c.bills.createShare(jb.id, { mode: 'WHOLE' });
    await expect(c.payments.create(key(), { shareId: js.id, tip: 0, cashbackUse: 100, method: 'MADA', expectedTotal: js.amount - 100, phone: DEMO_PHONE })).rejects.toMatchObject({
      code: 'CASHBACK_UNAVAILABLE',
    });
  });
});

describe('review fixes', () => {
  it('cashback cannot be double-spent by two payments in flight', async () => {
    const { newBill } = await import('../src/seed');
    const t12 = await db.table.findFirstOrThrow({ where: { label: '12' } });
    const b1 = await bill();
    const b2 = await newBill(db, t12.id);
    const s1 = await c.bills.createShare(b1.id, { mode: 'WHOLE' });
    const s2 = await c.bills.createShare(b2.id, { mode: 'WHOLE' });
    c.gateway.mode = 'HANG';
    const results = await Promise.allSettled([
      c.payments.create(key(), { shareId: s1.id, tip: 0, cashbackUse: 2500, method: 'MADA', expectedTotal: s1.amount - 2500, phone: DEMO_PHONE }),
      c.payments.create(key(), { shareId: s2.id, tip: 0, cashbackUse: 2500, method: 'MADA', expectedTotal: s2.amount - 2500, phone: DEMO_PHONE }),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { code: 'CASHBACK_UNAVAILABLE' } });
    expect(await c.cashback.balance(DEMO_PHONE)).toBe(0);
    // the held cashback comes back when the hung payment expires
    clock = new Date(clock.getTime() + 91_000);
    await c.payments.recover();
    expect(await c.cashback.balance(DEMO_PHONE)).toBe(2500);
  });

  it('a capture after expiry is settled by re-polling even if the webhook is lost', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    c.gateway.mode = 'LATE_SUCCESS';
    const p = await c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount });
    clock = new Date(clock.getTime() + 91_000);
    await c.payments.recover();
    expect((await c.payments.get(p.id)).state).toBe('EXPIRED');
    c.gateway.settleLate((await db.payment.findUniqueOrThrow({ where: { id: p.id } })).gatewayRef); // no webhook
    expect((await c.payments.recover()).settled).toBe(1);
    expect((await c.payments.get(p.id)).status).toBe('PAID');
  });

  it('a hung charge is voided at the deadline', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    c.gateway.mode = 'HANG';
    const p = await c.payments.create(key(), { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s.amount });
    clock = new Date(clock.getTime() + 91_000);
    await c.payments.recover();
    const ref = (await db.payment.findUniqueOrThrow({ where: { id: p.id } })).gatewayRef;
    expect(await c.gateway.status(ref)).toBe('DECLINED');
  });

  it('a retry with the same key reaches the payment even if the first response was never stored', async () => {
    const b = await bill();
    const s = await c.bills.createShare(b.id, { mode: 'WHOLE' });
    const k = key();
    const body = { shareId: s.id, tip: 0, cashbackUse: 0, method: 'MADA' as const, expectedTotal: s.amount };
    const first = await c.payments.create(k, body);
    await db.idempotencyRecord.update({ where: { key: k }, data: { responseBody: Prisma.DbNull } }); // simulate a crash after charging
    const again = await c.payments.create(k, body);
    expect(again.id).toBe(first.id);
    expect(c.gateway.chargeCalls).toBe(1);
  });

  it('two bills on one branch completing together get different invoice numbers', async () => {
    const { newBill } = await import('../src/seed');
    const t12 = await db.table.findFirstOrThrow({ where: { label: '12' } });
    const b1 = await bill();
    const b2 = await newBill(db, t12.id);
    const s1 = await c.bills.createShare(b1.id, { mode: 'WHOLE' });
    const s2 = await c.bills.createShare(b2.id, { mode: 'WHOLE' });
    await Promise.all([
      c.payments.create(key(), { shareId: s1.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s1.amount }),
      c.payments.create(key(), { shareId: s2.id, tip: 0, cashbackUse: 0, method: 'MADA', expectedTotal: s2.amount }),
    ]);
    const invs = await db.invoice.findMany({ orderBy: { number: 'asc' } });
    expect(invs).toHaveLength(2);
    expect(invs[0].number).not.toBe(invs[1].number);
    // one chain, not a fork: the genesis invoice's hash is the other's previous hash
    const genesis = invs.find((i) => i.previousHash.startsWith('MOCK'))!;
    const next = invs.find((i) => i !== genesis)!;
    expect(next.previousHash).toBe(genesis.hash);
  });

  it('membership offer needs a succeeded payment, and one phone gets one active membership', async () => {
    const base = { phone: DEMO_PHONE, otp: DEMO_OTP, textVersion: MEMBERSHIP_TERMS.version, locale: 'en' as const, consent: true };
    await expect(c.memberships.join({ ...base, paymentId: 'nope' })).rejects.toMatchObject({ code: 'VALIDATION' });
    const m1 = await c.memberships.join(base);
    const m2 = await c.memberships.join(base);
    expect(m2.id).toBe(m1.id);
  });
});
