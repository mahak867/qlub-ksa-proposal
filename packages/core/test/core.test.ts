import { describe, expect, it } from 'vitest';
import {
  equalParts,
  itemsAmount,
  checkAgainstRemaining,
  SplitError,
  vatFromInclusive,
  toDecimalString,
  canTransition,
  assertTransition,
  dinerStatus,
  encodeTlv,
  decodeTlv,
  invoiceQr,
  TlvError,
  computeCharge,
  MockGateway,
} from '../src';

describe('equal split', () => {
  it('always sums to the total, remainder to the first shares', () => {
    expect(equalParts(1000, 3)).toEqual([334, 333, 333]);
    for (const total of [1, 99, 100, 101, 12345, 99999]) {
      for (let n = 1; n <= 9; n++) {
        const parts = equalParts(total, n);
        expect(parts.reduce((a, b) => a + b, 0)).toBe(total);
        expect(Math.max(...parts) - Math.min(...parts)).toBeLessThanOrEqual(1);
      }
    }
  });
  it('rejects silly people counts', () => {
    expect(() => equalParts(100, 0)).toThrow(SplitError);
  });
});

describe('item split', () => {
  const items = [
    { id: 'a', quantity: 2, unitPrice: 3500 },
    { id: 'b', quantity: 1, unitPrice: 1200 },
  ];
  it('sums claimed units', () => {
    expect(itemsAmount(items, [{ itemId: 'a', quantity: 1 }, { itemId: 'b', quantity: 1 }], new Map())).toBe(4700);
  });
  it('rejects units already claimed by someone else', () => {
    expect(() => itemsAmount(items, [{ itemId: 'a', quantity: 2 }], new Map([['a', 1]]))).toThrow(/only 1/);
  });
  it('rejects unknown and duplicate items', () => {
    expect(() => itemsAmount(items, [{ itemId: 'z', quantity: 1 }], new Map())).toThrow(SplitError);
    expect(() => itemsAmount(items, [{ itemId: 'a', quantity: 1 }, { itemId: 'a', quantity: 1 }], new Map())).toThrow(SplitError);
  });
  it('custom share cannot exceed what is left', () => {
    expect(() => checkAgainstRemaining(501, 500)).toThrow(/more than/);
    expect(() => checkAgainstRemaining(0, 500)).toThrow(SplitError);
    expect(() => checkAgainstRemaining(500, 500)).not.toThrow();
  });
});

describe('VAT (15%, inclusive)', () => {
  it('vat + net = gross for awkward amounts', () => {
    for (let g = 0; g < 5000; g += 7) {
      const { vat, net } = vatFromInclusive(g);
      expect(vat + net).toBe(g);
      expect(Math.abs(vat - (g * 15) / 115)).toBeLessThanOrEqual(0.5);
    }
    expect(vatFromInclusive(11500)).toEqual({ vat: 1500, net: 10000 });
  });
  it('formats decimals for QR tags', () => {
    expect(toDecimalString(11500)).toBe('115.00');
    expect(toDecimalString(5)).toBe('0.05');
  });
  it('refuses floats', () => {
    expect(() => vatFromInclusive(10.5)).toThrow(RangeError);
  });
});

describe('payment state machine', () => {
  it('allows the happy paths', () => {
    expect(canTransition('CREATED', 'PROCESSING')).toBe(true);
    expect(canTransition('PROCESSING', 'SUCCEEDED')).toBe(true);
    expect(canTransition('PROCESSING', 'EXPIRED')).toBe(true);
    expect(canTransition('EXPIRED', 'REFUND_DUE')).toBe(true);
    expect(canTransition('REFUND_DUE', 'REFUNDED')).toBe(true);
  });
  it('rejects every illegal transition', () => {
    expect(() => assertTransition('SUCCEEDED', 'FAILED')).toThrow();
    expect(() => assertTransition('REFUNDED', 'SUCCEEDED')).toThrow();
    expect(() => assertTransition('CREATED', 'SUCCEEDED')).toThrow();
    expect(() => assertTransition('PROCESSING', 'REFUNDED')).toThrow();
  });
  it('maps to the four diner statuses', () => {
    expect(dinerStatus('PROCESSING')).toBe('CHECKING');
    expect(dinerStatus('EXPIRED')).toBe('NOT_CHARGED');
    expect(dinerStatus('REFUND_DUE')).toBe('REFUND_ON_ITS_WAY');
  });
});

describe('TLV QR', () => {
  it('round-trips the five real tags, including an Arabic seller name', () => {
    const qr = invoiceQr({
      sellerName: 'مطعم السفرة',
      vatNumber: '310122393500003',
      timestamp: '2026-11-14T18:30:00Z',
      total: '115.00',
      vat: '15.00',
    });
    const fields = decodeTlv(qr);
    expect(fields.map((f) => f.tag)).toEqual([1, 2, 3, 4, 5]);
    expect(fields[0].bytes.toString('utf8')).toBe('مطعم السفرة');
    // 10 Arabic letters + 1 space: 2 bytes each + 1 = 21 bytes, not 11 characters
    expect(fields[0].bytes.length).toBe(21);
    expect(fields[3].bytes.toString()).toBe('115.00');
  });
  it('labels the mocked Phase-2 tags', () => {
    const qr = invoiceQr({ sellerName: 'X', vatNumber: '310122393500003', timestamp: '2026-11-14T18:30:00Z', total: '1.00', vat: '0.13', includeMockPhase2: true });
    const fields = decodeTlv(qr);
    expect(fields.map((f) => f.tag)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(fields[8].bytes.toString()).toMatch(/^MOCK-NOT-VALID/);
  });
  it('rejects values over 255 bytes and bad VAT numbers', () => {
    expect(() => encodeTlv([{ tag: 1, value: 'ع'.repeat(128) }])).toThrow(TlvError);
    expect(() => invoiceQr({ sellerName: 'X', vatNumber: '123', timestamp: '2026-11-14T18:30:00Z', total: '1.00', vat: '0.13' })).toThrow(TlvError);
  });
});

describe('charge breakdown', () => {
  it('tip is added, cashback is subtracted, nothing else', () => {
    expect(computeCharge(10000, 0, 0).charge).toBe(10000);
    expect(computeCharge(10000, 1000, 2500).charge).toBe(8500);
  });
  it('cashback cannot exceed the share', () => {
    expect(() => computeCharge(1000, 0, 1001)).toThrow();
  });
});

describe('mock gateway', () => {
  it('is idempotent on reference', async () => {
    const g = new MockGateway();
    await g.charge({ reference: 'k1', amount: 100, method: 'MADA' });
    await g.charge({ reference: 'k1', amount: 100, method: 'MADA' });
    expect(g.chargeCalls).toBe(1);
  });
});
