import { Payment, PrismaClient } from '@prisma/client';
import { ApiError } from '../errors';
import type { Tx } from './bills';

/** Concept rule: 3% of the share comes back as cashback at branches that earn it, valid 90 days. */
export const EARN_PERCENT = 3;
export const EARN_VALID_DAYS = 90;

/**
 * Ledger rules:
 *  - balance = unexpired EARN − SPEND (a SPEND row is written as a hold when a payment
 *    starts and deleted again if that payment fails or expires).
 *  - Concept simplification: SPEND is not matched against specific EARN rows, so an EARN
 *    that expires after being partly spent still counts as fully expired.
 *  - Phone numbers are NOT verified in this demo. A real system needs an OTP-backed session
 *    before anyone can read or spend a wallet.
 */
export class CashbackService {
  constructor(private readonly db: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  async balance(phone: string, tx: Tx | PrismaClient = this.db): Promise<number> {
    const now = this.now();
    const earn = await tx.cashbackEntry.aggregate({ where: { phone, type: 'EARN', OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] }, _sum: { amount: true } });
    const spend = await tx.cashbackEntry.aggregate({ where: { phone, type: { in: ['SPEND', 'EXPIRE'] } }, _sum: { amount: true } });
    return Math.max(0, (earn._sum.amount ?? 0) - (spend._sum.amount ?? 0));
  }

  /** Serialise all wallet changes for one phone inside the current transaction. */
  private async lockPhone(tx: Tx, phone: string) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'wallet:' + phone}))`;
  }

  async hold(tx: Tx, phone: string, branchId: string, amount: number, paymentId: string) {
    await this.lockPhone(tx, phone);
    const balance = await this.balance(phone, tx);
    if (amount > balance) throw new ApiError('CASHBACK_UNAVAILABLE', 'not enough cashback balance');
    await tx.cashbackEntry.create({ data: { phone, branchId, type: 'SPEND', amount, paymentId } });
  }

  async release(tx: Tx, paymentId: string) {
    await tx.cashbackEntry.deleteMany({ where: { paymentId, type: 'SPEND' } });
  }

  async onPaymentSucceeded(tx: Tx, p: Payment, tableId: string, now: Date): Promise<void> {
    if (!p.phone) return;
    const table = await tx.table.findUniqueOrThrow({ where: { id: tableId }, include: { branch: true } });
    if (p.cashbackUsed > 0) {
      // A late success after expiry: the hold was released, so take it again (best effort).
      const held = await tx.cashbackEntry.count({ where: { paymentId: p.id, type: 'SPEND' } });
      if (held === 0) {
        await this.lockPhone(tx, p.phone);
        await tx.cashbackEntry.create({ data: { phone: p.phone, branchId: table.branchId, type: 'SPEND', amount: p.cashbackUsed, paymentId: p.id } });
      }
    }
    if (table.branch.earnsCashback) {
      const earned = Math.floor((p.amount * EARN_PERCENT) / 100);
      if (earned > 0) {
        await tx.cashbackEntry.create({
          data: { phone: p.phone, branchId: table.branchId, type: 'EARN', amount: earned, paymentId: p.id, expiresAt: new Date(now.getTime() + EARN_VALID_DAYS * 86400_000) },
        });
      }
    }
  }

  async wallet(phone: string) {
    const balance = await this.balance(phone);
    const soonest = await this.db.cashbackEntry.findFirst({
      where: { phone, type: 'EARN', expiresAt: { gt: this.now() } },
      orderBy: { expiresAt: 'asc' },
    });
    return { balance, soonestExpiry: soonest?.expiresAt?.toISOString() ?? null };
  }

  async branches(city?: string) {
    const rows = await this.db.branch.findMany({ where: city ? { city } : {}, include: { restaurant: true }, orderBy: [{ city: 'asc' }, { nameEn: 'asc' }] });
    const map = (b: (typeof rows)[number]) => ({ id: b.id, city: b.city, nameAr: b.nameAr, nameEn: b.nameEn, restaurantAr: b.restaurant.nameAr, restaurantEn: b.restaurant.nameEn, earns: b.earnsCashback, accepts: b.acceptsCashback });
    return {
      accepts: rows.filter((b) => b.acceptsCashback).map(map),
      earnOnly: rows.filter((b) => b.earnsCashback && !b.acceptsCashback).map(map),
      cities: [...new Set((await this.db.branch.findMany({ select: { city: true } })).map((b) => b.city))].sort(),
    };
  }
}
