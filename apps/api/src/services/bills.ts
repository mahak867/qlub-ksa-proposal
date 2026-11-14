import { Prisma, PrismaClient, Share, SplitMode } from '@prisma/client';
import { checkAgainstRemaining, equalShareAmount, itemsAmount, ItemClaim, SplitError } from '@qlub-pay/core';
import { ApiError } from '../errors';

export type Tx = Prisma.TransactionClient;

/** Unpaid shares hold their reservation this long without an active payment. */
export const SHARE_RESERVATION_MS = 10 * 60_000;

export interface CreateShareInput {
  mode: SplitMode;
  people?: number;
  items?: ItemClaim[];
  amount?: number;
}

/** Lock the bill row so share accounting is serialised per bill. */
export async function lockBill(tx: Tx, billId: string): Promise<void> {
  const rows = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM "Bill" WHERE id = ${billId} FOR UPDATE`;
  if (rows.length === 0) throw new ApiError('NOT_FOUND', 'bill not found');
}

export function claimedUnits(shares: Pick<Share, 'mode' | 'itemClaims' | 'status'>[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const s of shares) {
    if (s.status === 'RELEASED' || s.mode !== 'ITEMS' || !s.itemClaims) continue;
    for (const c of s.itemClaims as unknown as ItemClaim[]) m.set(c.itemId, (m.get(c.itemId) ?? 0) + c.quantity);
  }
  return m;
}

export class BillService {
  constructor(private readonly db: PrismaClient) {}

  async getByToken(token: string) {
    const table = await this.db.table.findUnique({
      where: { token },
      include: {
        branch: { include: { restaurant: true } },
        bills: { where: { status: 'OPEN' }, orderBy: { createdAt: 'desc' }, take: 1 },
      },
    });
    if (!table) throw new ApiError('NOT_FOUND', 'table not found');
    let bill = table.bills[0];
    if (!bill) {
      const last = await this.db.bill.findFirst({ where: { tableId: table.id }, orderBy: { createdAt: 'desc' } });
      if (!last) throw new ApiError('NOT_FOUND', 'no bill on this table');
      bill = last;
    }
    return this.view(bill.id, table);
  }

  async view(billId: string, tableIn?: { label: string; branch: { id: string; nameAr: string; nameEn: string; city: string; acceptsCashback: boolean; earnsCashback: boolean; restaurant: { nameAr: string; nameEn: string } } }) {
    const bill = await this.db.bill.findUnique({
      where: { id: billId },
      include: { items: true, shares: true, invoice: true, table: { include: { branch: { include: { restaurant: true } } } } },
    });
    if (!bill) throw new ApiError('NOT_FOUND', 'bill not found');
    const table = tableIn ?? bill.table;
    const paid = bill.shares.filter((s) => s.status === 'PAID').reduce((a, s) => a + s.amount, 0);
    const reserved = bill.shares.filter((s) => s.status === 'RESERVED').reduce((a, s) => a + s.amount, 0);
    const claimed = claimedUnits(bill.shares);
    return {
      id: bill.id,
      status: bill.status,
      total: bill.total,
      paid,
      reserved,
      remaining: bill.total - paid - reserved,
      splitMode: bill.splitMode,
      equalCount: bill.equalCount,
      table: table.label,
      branch: {
        id: table.branch.id,
        nameAr: table.branch.nameAr,
        nameEn: table.branch.nameEn,
        city: table.branch.city,
        acceptsCashback: table.branch.acceptsCashback,
        earnsCashback: table.branch.earnsCashback,
      },
      restaurant: { nameAr: table.branch.restaurant.nameAr, nameEn: table.branch.restaurant.nameEn },
      items: bill.items.map((i) => ({ ...i, claimed: claimed.get(i.id) ?? 0 })),
      invoiceReady: !!bill.invoice,
    };
  }

  async createShare(billId: string, input: CreateShareInput) {
    try {
      return await this.db.$transaction(async (tx) => {
        await lockBill(tx, billId);
        const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId }, include: { items: true, shares: true } });
        if (bill.status !== 'OPEN') throw new ApiError('SHARE_UNAVAILABLE', 'this bill is already fully paid');
        const active = bill.shares.filter((s) => s.status !== 'RELEASED');
        const remaining = bill.total - active.reduce((a, s) => a + s.amount, 0);

        // WHOLE always means "pay what is left" and can follow any mode.
        if (input.mode !== 'WHOLE' && bill.splitMode && bill.splitMode !== input.mode && active.length > 0) {
          throw new ApiError('INVALID_SPLIT', `this bill is being split ${bill.splitMode}; choose "pay the rest" instead`);
        }

        let amount: number;
        let equalIndex: number | null = null;
        let equalCount = bill.equalCount;
        switch (input.mode) {
          case 'WHOLE':
            amount = remaining;
            if (amount < 1) throw new ApiError('SHARE_UNAVAILABLE', 'nothing left to pay');
            break;
          case 'ITEMS':
            amount = itemsAmount(bill.items, input.items ?? [], claimedUnits(active));
            break;
          case 'EQUAL': {
            const activeEqual = active.filter((s) => s.mode === 'EQUAL');
            if (activeEqual.length === 0 || !equalCount) equalCount = input.people ?? 0;
            const used = new Set(activeEqual.map((s) => s.equalIndex));
            let idx = 0;
            while (used.has(idx)) idx++;
            amount = equalShareAmount(bill.total, equalCount, idx);
            equalIndex = idx;
            break;
          }
          case 'CUSTOM':
            amount = input.amount ?? 0;
            break;
        }
        checkAgainstRemaining(amount, remaining);

        await tx.bill.update({
          where: { id: billId },
          data: {
            splitMode: input.mode === 'WHOLE' ? bill.splitMode ?? 'WHOLE' : input.mode,
            equalCount: input.mode === 'EQUAL' ? equalCount : bill.equalCount,
          },
        });
        const share = await tx.share.create({
          data: {
            billId,
            mode: input.mode,
            amount,
            equalIndex,
            itemClaims: input.mode === 'ITEMS' ? (input.items as unknown as Prisma.InputJsonValue) : undefined,
          },
        });
        await tx.event.create({ data: { name: 'share_created', billId, props: { mode: input.mode, amount } } });
        return share;
      });
    } catch (e) {
      if (e instanceof SplitError) throw new ApiError(e.code, e.message);
      throw e;
    }
  }

  async getShare(shareId: string) {
    const s = await this.db.share.findUnique({ where: { id: shareId }, include: { bill: { include: { table: { include: { branch: true } } } } } });
    if (!s) throw new ApiError('NOT_FOUND', 'share not found');
    return { id: s.id, billId: s.billId, mode: s.mode, amount: s.amount, status: s.status, acceptsCashback: s.bill.table.branch.acceptsCashback };
  }

  async releaseShare(shareId: string) {
    return this.db.$transaction(async (tx) => {
      const found = await tx.share.findUnique({ where: { id: shareId } });
      if (!found) throw new ApiError('NOT_FOUND', 'share not found');
      await lockBill(tx, found.billId);
      const share = await tx.share.findUniqueOrThrow({ where: { id: shareId }, include: { payments: true } });
      if (share.payments.some((p) => p.state === 'CREATED' || p.state === 'PROCESSING')) {
        throw new ApiError('PAYMENT_IN_PROGRESS', 'a payment for this share is still being checked');
      }
      const r = await tx.share.updateMany({ where: { id: shareId, status: 'RESERVED' }, data: { status: 'RELEASED' } });
      return { released: r.count === 1 };
    });
  }
}
