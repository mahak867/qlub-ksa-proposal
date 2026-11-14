/** All money is integer halalas (1 SAR = 100 halalas). */
export type Halalas = number;

export const VAT_RATE_PERCENT = 15;

export function assertHalalas(value: number, name = 'amount'): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new RangeError(`${name} must be a non-negative integer number of halalas, got ${value}`);
  }
}

/** Split a VAT-inclusive gross amount into VAT and net. VAT is rounded half-up. */
export function vatFromInclusive(gross: Halalas): { vat: Halalas; net: Halalas } {
  assertHalalas(gross, 'gross');
  const vat = Math.floor((gross * VAT_RATE_PERCENT * 2 + (100 + VAT_RATE_PERCENT)) / ((100 + VAT_RATE_PERCENT) * 2));
  return { vat, net: gross - vat };
}

/** "115.00" style, as used on ZATCA QR tags 4 and 5. */
export function toDecimalString(amount: Halalas): string {
  assertHalalas(amount);
  const whole = Math.floor(amount / 100);
  const frac = (amount % 100).toString().padStart(2, '0');
  return `${whole}.${frac}`;
}

export function formatSar(amount: Halalas, locale: 'ar' | 'en'): string {
  const value = toDecimalString(amount);
  return locale === 'ar' ? `${value} ر.س` : `SAR ${value}`;
}
