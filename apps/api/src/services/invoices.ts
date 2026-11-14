import { createHash } from 'crypto';
import { PrismaClient } from '@prisma/client';
import { invoiceQr, toDecimalString, vatFromInclusive } from '@qlub-pay/core';
import { ApiError } from '../errors';
import type { Tx } from './bills';

/**
 * Plays the POS role: one simplified tax invoice per fully paid bill.
 * The invoice "hash" here is a SHA-256 of a canonical JSON, a stand-in for the hash of
 * the UBL XML. The genesis previous-hash value is a labelled placeholder (unverified).
 */
export const MOCK_GENESIS_HASH = 'MOCK-GENESIS-UNVERIFIED';

export class InvoiceService {
  constructor(private readonly db: PrismaClient) {}

  async issue(tx: Tx, billId: string, now: Date) {
    const bill = await tx.bill.findUniqueOrThrow({ where: { id: billId }, include: { table: { include: { branch: { include: { restaurant: true } } } }, invoice: true } });
    if (bill.invoice) return bill.invoice;
    const branch = bill.table.branch;
    // Lock the branch row: the counter and hash chain are per branch, not per bill.
    const [locked] = await tx.$queryRaw<{ invoiceCounter: number; lastInvoiceHash: string | null }[]>`
      SELECT "invoiceCounter", "lastInvoiceHash" FROM "Branch" WHERE id = ${branch.id} FOR UPDATE`;
    const counter = locked.invoiceCounter + 1;
    const previousHash = locked.lastInvoiceHash ?? MOCK_GENESIS_HASH;
    const { vat } = vatFromInclusive(bill.total);
    const issuedAt = new Date(Math.floor(now.getTime() / 1000) * 1000);
    const timestamp = issuedAt.toISOString().replace('.000Z', 'Z');
    const number = `INV-${branch.id.slice(-4).toUpperCase()}-${String(counter).padStart(6, '0')}`;
    const hash = createHash('sha256')
      .update(JSON.stringify({ number, total: bill.total, vat, timestamp, previousHash }))
      .digest('base64');
    const qrBase64 = invoiceQr({
      sellerName: branch.restaurant.nameAr,
      vatNumber: branch.restaurant.vatNumber,
      timestamp,
      total: toDecimalString(bill.total),
      vat: toDecimalString(vat),
      includeMockPhase2: true,
    });
    await tx.branch.update({ where: { id: branch.id }, data: { invoiceCounter: counter, lastInvoiceHash: hash } });
    return tx.invoice.create({ data: { billId, number, issuedAt, total: bill.total, vat, qrBase64, previousHash, hash } });
  }

  async forBill(billId: string) {
    const inv = await this.db.invoice.findUnique({ where: { billId }, include: { bill: { include: { table: { include: { branch: { include: { restaurant: true } } } } } } } });
    if (!inv) throw new ApiError('NOT_FOUND', 'the invoice is issued once the whole bill is paid');
    const r = inv.bill.table.branch.restaurant;
    return {
      number: inv.number,
      issuedAt: inv.issuedAt.toISOString(),
      seller: { nameAr: r.nameAr, nameEn: r.nameEn, vatNumber: r.vatNumber },
      total: inv.total,
      vat: inv.vat,
      net: inv.total - inv.vat,
      qrBase64: inv.qrBase64,
      previousHash: inv.previousHash,
      reportStatus: inv.reportStatus,
      reportDeadline: new Date(inv.issuedAt.getTime() + 24 * 3600_000).toISOString(),
      notes: ['Phase-1 QR tags 1–5 are real. Tags 6–9 are MOCK values, not a valid ZATCA stamp.', 'Reporting to ZATCA is simulated.'],
    };
  }
}
