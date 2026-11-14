import { Halalas, assertHalalas } from './money';

export type SplitMode = 'WHOLE' | 'ITEMS' | 'EQUAL' | 'CUSTOM';

export interface BillItemLike {
  id: string;
  quantity: number;
  unitPrice: Halalas;
}

export interface ItemClaim {
  itemId: string;
  quantity: number;
}

export class SplitError extends Error {
  constructor(public readonly code: 'SHARE_UNAVAILABLE' | 'INVALID_SPLIT', message: string) {
    super(message);
  }
}

/**
 * Equal split of `total` into `n` parts. The remainder halalas go one each to the
 * first parts, so parts always sum exactly to `total`.
 */
export function equalParts(total: Halalas, n: number): Halalas[] {
  assertHalalas(total, 'total');
  if (!Number.isInteger(n) || n < 1 || n > 50) throw new SplitError('INVALID_SPLIT', 'people must be 1–50');
  const base = Math.floor(total / n);
  const remainder = total - base * n;
  return Array.from({ length: n }, (_, i) => base + (i < remainder ? 1 : 0));
}

/** Amount for the `index`-th equal share (0-based), given the share count. */
export function equalShareAmount(total: Halalas, n: number, index: number): Halalas {
  const parts = equalParts(total, n);
  if (index < 0 || index >= parts.length) throw new SplitError('SHARE_UNAVAILABLE', 'all equal shares are taken');
  return parts[index];
}

/**
 * Amount for an item claim. `alreadyClaimed` maps itemId -> units already claimed
 * by paid or reserved shares.
 */
export function itemsAmount(items: BillItemLike[], claims: ItemClaim[], alreadyClaimed: Map<string, number>): Halalas {
  if (claims.length === 0) throw new SplitError('INVALID_SPLIT', 'select at least one item');
  const byId = new Map(items.map((i) => [i.id, i]));
  const seen = new Set<string>();
  let sum = 0;
  for (const c of claims) {
    const item = byId.get(c.itemId);
    if (!item) throw new SplitError('INVALID_SPLIT', `unknown item ${c.itemId}`);
    if (seen.has(c.itemId)) throw new SplitError('INVALID_SPLIT', `item ${c.itemId} listed twice`);
    seen.add(c.itemId);
    if (!Number.isInteger(c.quantity) || c.quantity < 1) throw new SplitError('INVALID_SPLIT', 'quantity must be ≥ 1');
    const free = item.quantity - (alreadyClaimed.get(c.itemId) ?? 0);
    if (c.quantity > free) throw new SplitError('SHARE_UNAVAILABLE', `only ${free} of item ${c.itemId} left`);
    sum += c.quantity * item.unitPrice;
  }
  return sum;
}

/** Validate a share amount against what is still unclaimed. */
export function checkAgainstRemaining(amount: Halalas, remaining: Halalas): void {
  assertHalalas(amount, 'amount');
  if (amount < 1) throw new SplitError('INVALID_SPLIT', 'amount must be at least 1 halala');
  if (amount > remaining) throw new SplitError('SHARE_UNAVAILABLE', 'amount is more than what is left on the bill');
}
