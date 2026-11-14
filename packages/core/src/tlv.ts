/**
 * ZATCA simplified-invoice QR: TLV records (tag 1 byte, length 1 byte, value bytes),
 * concatenated and Base64-encoded. Length counts BYTES (UTF-8), not characters.
 *
 * Tags 1–5 are encoded for real. Tags 6–9 (hash, signature, public key, ZATCA stamp)
 * come from cryptographic signing in Phase 2; this concept fills them with labelled
 * mock values and does NOT produce a valid Phase-2 stamp.
 */
export interface TlvField {
  tag: number;
  value: string | Uint8Array;
}

export class TlvError extends Error {}

export function encodeTlv(fields: TlvField[]): string {
  const chunks: Buffer[] = [];
  for (const f of fields) {
    if (!Number.isInteger(f.tag) || f.tag < 1 || f.tag > 255) throw new TlvError(`bad tag ${f.tag}`);
    const bytes = typeof f.value === 'string' ? Buffer.from(f.value, 'utf8') : Buffer.from(f.value);
    if (bytes.length > 255) throw new TlvError(`tag ${f.tag} value is ${bytes.length} bytes; max 255`);
    chunks.push(Buffer.from([f.tag, bytes.length]), bytes);
  }
  return Buffer.concat(chunks).toString('base64');
}

export function decodeTlv(base64: string): { tag: number; bytes: Buffer }[] {
  const buf = Buffer.from(base64, 'base64');
  const out: { tag: number; bytes: Buffer }[] = [];
  let i = 0;
  while (i < buf.length) {
    if (i + 2 > buf.length) throw new TlvError('truncated header');
    const tag = buf[i];
    const len = buf[i + 1];
    if (i + 2 + len > buf.length) throw new TlvError(`truncated value for tag ${tag}`);
    out.push({ tag, bytes: buf.subarray(i + 2, i + 2 + len) });
    i += 2 + len;
  }
  return out;
}

export interface InvoiceQrInput {
  sellerName: string;
  vatNumber: string;
  /** ISO 8601 UTC, e.g. 2026-11-14T18:30:00Z */
  timestamp: string;
  /** decimal strings, e.g. "115.00" */
  total: string;
  vat: string;
  /** include mocked Phase-2 tags 6–9 (clearly labelled) */
  includeMockPhase2?: boolean;
}

export const MOCK_PHASE2_PREFIX = 'MOCK-NOT-VALID';

export function invoiceQr(input: InvoiceQrInput): string {
  if (!/^\d{15}$/.test(input.vatNumber)) throw new TlvError('VAT number must be 15 digits');
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/.test(input.timestamp)) throw new TlvError('timestamp must be ISO 8601 UTC');
  const fields: TlvField[] = [
    { tag: 1, value: input.sellerName },
    { tag: 2, value: input.vatNumber },
    { tag: 3, value: input.timestamp },
    { tag: 4, value: input.total },
    { tag: 5, value: input.vat },
  ];
  if (input.includeMockPhase2) {
    fields.push(
      { tag: 6, value: `${MOCK_PHASE2_PREFIX}-xml-hash` },
      { tag: 7, value: `${MOCK_PHASE2_PREFIX}-ecdsa-signature` },
      { tag: 8, value: `${MOCK_PHASE2_PREFIX}-public-key` },
      { tag: 9, value: `${MOCK_PHASE2_PREFIX}-zatca-stamp` },
    );
  }
  return encodeTlv(fields);
}
