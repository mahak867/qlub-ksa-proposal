import { Halalas, assertHalalas } from './money';

/** Tip presets shown as options. None is selected by default; the default tip is 0. */
export const TIP_PRESETS_PERCENT = [5, 10, 15] as const;
export const DEFAULT_TIP: Halalas = 0;

export function tipFromPercent(shareAmount: Halalas, percent: number): Halalas {
  assertHalalas(shareAmount);
  return Math.round((shareAmount * percent) / 100);
}

export interface ChargeBreakdown {
  share: Halalas;
  tip: Halalas;
  cashbackUsed: Halalas;
  /** what the diner is charged */
  charge: Halalas;
}

/** The single source of truth for "what you are charged" (P1). */
export function computeCharge(share: Halalas, tip: Halalas, cashbackUsed: Halalas): ChargeBreakdown {
  assertHalalas(share, 'share');
  assertHalalas(tip, 'tip');
  assertHalalas(cashbackUsed, 'cashbackUsed');
  if (cashbackUsed > share) throw new RangeError('cashback cannot exceed the share');
  if (tip > share * 2) throw new RangeError('tip looks wrong (more than twice the share)');
  return { share, tip, cashbackUsed, charge: share - cashbackUsed + tip };
}
