export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiFailure extends Error {
  constructor(public code: string, message: string, public details: unknown, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; idempotencyKey?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  if (init.json !== undefined) headers['content-type'] = 'application/json';
  if (init.idempotencyKey) headers['idempotency-key'] = init.idempotencyKey;
  const res = await fetch(`${API}${path}`, {
    ...init,
    headers,
    body: init.json !== undefined ? JSON.stringify(init.json) : init.body,
    cache: 'no-store',
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiFailure(body.code ?? 'HTTP', body.message ?? res.statusText, body.details, res.status);
  return body as T;
}

export interface BillItem {
  id: string;
  nameAr: string;
  nameEn: string;
  quantity: number;
  unitPrice: number;
  claimed: number;
}

export interface Bill {
  id: string;
  status: 'OPEN' | 'PAID';
  total: number;
  paid: number;
  reserved: number;
  remaining: number;
  splitMode: 'WHOLE' | 'ITEMS' | 'EQUAL' | 'CUSTOM' | null;
  equalCount: number | null;
  table: string;
  branch: { id: string; nameAr: string; nameEn: string; city: string; acceptsCashback: boolean; earnsCashback: boolean };
  restaurant: { nameAr: string; nameEn: string };
  items: BillItem[];
  invoiceReady: boolean;
}

export interface Share {
  id: string;
  billId: string;
  mode: string;
  amount: number;
}

export interface PaymentView {
  id: string;
  state: string;
  status: 'PAID' | 'CHECKING' | 'NOT_CHARGED' | 'REFUND_ON_ITS_WAY' | 'REFUNDED';
  amount: number;
  tip: number;
  cashbackUsed: number;
  charge: number;
  method: 'MADA' | 'APPLE_PAY';
  reference: string;
  deadlineAt: string;
  billId: string;
  billPaid: boolean;
  invoiceNumber: string | null;
  tableToken: string;
  retry: 'REVIEW' | 'SPLIT';
}

/** One key per press of the pay button, kept across retries of that press. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}
