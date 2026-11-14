import { Payment, PrismaClient } from '@prisma/client';
import type { Tx } from './bills';

/** Concept rule: 3% of the share comes back as cashback at branches that earn it, valid 90 days. */
export const EARN_PERCENT = 3;
export const EARN_VALID_DAYS = 90;

export class CashbackService {
  constructor(private readonly db: PrismaClient) {}

  async balance(phone: string, tx: Tx | PrismaClient = this.db): Promise<number> {
    const groups = await tx.cashbackEntry.groupBy({ by: ['type'], where: { phone }, _sum: { amount: true } });
    const sum = (t: string) => groups.find((g) => g.type === t)?._sum.amount ?? 0;
    return sum('EARN') - sum('SPEND') - sum('EXPIRE');
  }

  async onPaymentSucceeded(tx: Tx, p: Payment, tableId: string): Promise<void> {
    if (!p.phone) return;
    const table = await tx.table.findUniqueOrThrow({ where: { id: tableId }, include: { branch: true } });
    if (p.cashbackUsed > 0) {
      await tx.cashbackEntry.create({ data: { phone: p.phone, branchId: table.branchId, type: 'SPEND', amount: p.cashbackUsed } });
    }
    if (table.branch.earnsCashback) {
      const earned = Math.floor((p.amount * EARN_PERCENT) / 100);
      if (earned > 0) {
        await tx.cashbackEntry.create({
          data: { phone: p.phone, branchId: table.branchId, type: 'EARN', amount: earned, expiresAt: new Date(Date.now() + EARN_VALID_DAYS * 86400_000) },
        });
      }
    }
  }

  async wallet(phone: string) {
    const balance = await this.balance(phone);
    const soonest = await this.db.cashbackEntry.findFirst({
      where: { phone, type: 'EARN', expiresAt: { gt: new Date() } },
      orderBy: { expiresAt: 'asc' },
    });
    const history = await this.db.cashbackEntry.findMany({ where: { phone }, orderBy: { createdAt: 'desc' }, take: 20, include: { branch: true } });
    return {
      phone,
      balance,
      soonestExpiry: soonest?.expiresAt?.toISOString() ?? null,
      history: history.map((h) => ({ type: h.type, amount: h.amount, at: h.createdAt.toISOString(), branchAr: h.branch.nameAr, branchEn: h.branch.nameEn })),
    };
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
