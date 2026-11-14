import { PrismaClient } from '@prisma/client';
import { ApiError } from '../errors';

/**
 * Mock POS menu feed (stand-in for a Foodics-style integration). In the demo the feed
 * has one price change and one new item, so the sync-health check has something to show.
 */
export function mockPosFeed(menu: { posCode: string; nameEn: string; unitPrice: number }[]) {
  const feed = menu.map((m) => ({ ...m }));
  if (feed[1]) feed[1].unitPrice += 500;
  feed.push({ posCode: 'POS-NEW-01', nameEn: 'Saffron tea', unitPrice: 1400 });
  return feed;
}

export class MerchantService {
  constructor(private readonly db: PrismaClient) {}

  async overview(branchId: string) {
    const branch = await this.db.branch.findUnique({
      where: { id: branchId },
      include: {
        restaurant: true,
        tables: { include: { bills: { orderBy: { createdAt: 'desc' }, take: 1, include: { shares: { include: { payments: true } }, invoice: true } } } },
      },
    });
    if (!branch) throw new ApiError('NOT_FOUND', 'branch not found');

    const tables = branch.tables.map((t) => {
      const bill = t.bills[0];
      if (!bill) return { label: t.label, bill: null };
      const payments = bill.shares.flatMap((s) => s.payments);
      const succeeded = payments.filter((p) => p.state === 'SUCCEEDED');
      const sharesPaid = bill.shares.filter((s) => s.status === 'PAID').reduce((a, s) => a + s.amount, 0);
      const collected = succeeded.reduce((a, p) => a + p.amount, 0);
      return {
        label: t.label,
        bill: {
          id: bill.id,
          status: bill.status,
          total: bill.total,
          paid: sharesPaid,
          tips: succeeded.reduce((a, p) => a + p.tip, 0),
          cashbackRedeemed: succeeded.reduce((a, p) => a + p.cashbackUsed, 0),
          reconciled: collected === sharesPaid,
          payments: payments
            .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
            .map((p) => ({ id: p.id, state: p.state, amount: p.amount, tip: p.tip, at: p.createdAt.toISOString() })),
          invoice: bill.invoice && { number: bill.invoice.number, reportStatus: bill.invoice.reportStatus, reportDeadline: new Date(bill.invoice.issuedAt.getTime() + 24 * 3600_000).toISOString() },
        },
      };
    });

    const names = ['bill_viewed', 'share_created', 'payment_started', 'payment_succeeded', 'payment_failed', 'payment_expired', 'refund_due', 'membership_joined', 'membership_cancelled'];
    const counts = await this.db.event.groupBy({ by: ['name'], _count: { _all: true }, where: { name: { in: names } } });
    const funnel = Object.fromEntries(names.map((n) => [n, counts.find((c) => c.name === n)?._count._all ?? 0]));
    const tipped = await this.db.payment.count({ where: { state: 'SUCCEEDED', tip: { gt: 0 } } });
    const succeeded = await this.db.payment.count({ where: { state: 'SUCCEEDED' } });

    return {
      branch: { id: branch.id, nameAr: branch.nameAr, nameEn: branch.nameEn, city: branch.city, restaurantEn: branch.restaurant.nameEn },
      tables,
      metrics: { funnel, tipRate: succeeded ? tipped / succeeded : null, stuckPayments: await this.db.payment.count({ where: { state: 'PROCESSING', deadlineAt: { lt: new Date() } } }) },
    };
  }

  async syncHealth(branchId: string) {
    const branch = await this.db.branch.findUnique({ where: { id: branchId }, include: { menu: true, tables: true } });
    if (!branch) throw new ApiError('NOT_FOUND', 'branch not found');
    const feed = mockPosFeed(branch.menu);
    const stored = new Map(branch.menu.map((m) => [m.posCode, m]));
    const priceChanged = feed
      .filter((f) => stored.has(f.posCode) && stored.get(f.posCode)!.unitPrice !== f.unitPrice)
      .map((f) => ({ posCode: f.posCode, name: f.nameEn, stored: stored.get(f.posCode)!.unitPrice, pos: f.unitPrice }));
    const missing = feed.filter((f) => !stored.has(f.posCode)).map((f) => ({ posCode: f.posCode, name: f.nameEn, pos: f.unitPrice }));
    const unmappedTables = branch.tables.filter((t) => !t.posTableCode).map((t) => t.label);
    const issues = priceChanged.length + missing.length + unmappedTables.length;
    return {
      status: issues === 0 ? 'GREEN' : priceChanged.length > 0 ? 'RED' : 'AMBER',
      lastSyncAt: new Date(Date.now() - 6 * 3600_000).toISOString(),
      priceChanged,
      missing,
      unmappedTables,
      note: 'Mock POS feed; no real POS is contacted.',
    };
  }
}
