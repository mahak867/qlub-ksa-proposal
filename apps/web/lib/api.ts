/** Session tokens live in this browser only (a per-viewer convenience). */
export type TokenKind = 'diner' | 'merchant';
export function getToken(kind: TokenKind): string | undefined {
  try {
    const raw = localStorage.getItem(`session:${kind}`);
    if (!raw) return undefined;
    const { token, expiresAt, phone } = JSON.parse(raw);
    if (new Date(expiresAt).getTime() < Date.now()) return undefined;
    void phone;
    return token;
  } catch {
    return undefined;
  }
}
export function getSessionPhone(): string | undefined {
  try {
    const raw = localStorage.getItem('session:diner');
    return raw && getToken('diner') ? JSON.parse(raw).phone : undefined;
  } catch {
    return undefined;
  }
}
export function setToken(kind: TokenKind, value: { token: string; expiresAt: string; phone?: string; branchId?: string } | null) {
  try {
    if (value) localStorage.setItem(`session:${kind}`, JSON.stringify(value));
    else localStorage.removeItem(`session:${kind}`);
  } catch {}
}

export const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

export class ApiFailure extends Error {
  constructor(public code: string, message: string, public details: unknown, public status: number) {
    super(message);
  }
}

export async function api<T>(path: string, init: RequestInit & { json?: unknown; idempotencyKey?: string; auth?: string } = {}): Promise<T> {
  const headers: Record<string, string> = {};
  const token = init.auth ?? getToken('diner');
  if (token) headers['authorization'] = `Bearer ${token}`;
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
  retry: 'REVIEW' | 'SPLIT';
}

/** One key per press of the pay button, kept across retries of that press. */
export function newIdempotencyKey(): string {
  return crypto.randomUUID();
}

const ERRORS: Record<string, { ar: string; en: string }> = {
  TOTAL_CHANGED: { ar: 'تغيّر المبلغ. راجع الإجمالي الجديد ثم ادفع.', en: 'The total changed. Check the new total, then pay.' },
  SHARE_UNAVAILABLE: { ar: 'هذا الجزء من الفاتورة لم يعد متاحًا. اختر مرة أخرى.', en: 'That part of the bill is no longer available. Choose again.' },
  PAYMENT_IN_PROGRESS: { ar: 'دفعتك قيد التحقق. اضغط مرة أخرى بعد لحظات؛ لن يتم الخصم مرتين.', en: 'Your payment is being checked. Press again in a moment; you will not be charged twice.' },
  CASHBACK_UNAVAILABLE: { ar: 'لا يمكن استخدام الكاش باك هنا أو الرصيد غير كافٍ.', en: 'Cashback can’t be used here, or the balance is too low.' },
  INVALID_SPLIT: { ar: 'طريقة التقسيم غير صالحة لهذه الفاتورة.', en: 'That split isn’t possible for this bill.' },
  VALIDATION: { ar: 'تحقق من البيانات المدخلة.', en: 'Please check what you entered.' },
  CONSENT_REQUIRED: { ar: 'نحتاج موافقتك الصريحة على الشروط.', en: 'We need your explicit agreement to the terms.' },
  NOT_FOUND: { ar: 'غير موجود.', en: 'Not found.' },
  UNAUTHORIZED: { ar: 'سجّل الدخول أولًا.', en: 'Please sign in first.' },
};

/** Translate an API error code; fall back to the server message. */
export function errorText(code: string, locale: 'ar' | 'en', fallback: string): string {
  return ERRORS[code]?.[locale] ?? fallback;
}
