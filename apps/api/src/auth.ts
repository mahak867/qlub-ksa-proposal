import { createHmac, timingSafeEqual } from 'crypto';
import { ApiError } from './errors';

/**
 * Minimal signed session tokens (HMAC-SHA256), no external dependency.
 *  - Diner sessions prove a phone number was verified by a one-time code.
 *  - Merchant sessions prove the restaurant PIN for one branch.
 *
 * Demo values: the OTP is always DEMO_OTP and the PIN is DEMO_MERCHANT_PIN. A real build
 * would send the OTP by SMS, store PIN hashes per branch, and rotate SESSION_SECRET.
 */
export const DEMO_OTP = '123456';
export const DEMO_MERCHANT_PIN = '2468';
const DINER_TTL_MS = 12 * 3600_000;
const MERCHANT_TTL_MS = 8 * 3600_000;

function secret(): string {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 32) return s;
  if (process.env.NODE_ENV === 'production' && process.env.DEMO_MODE === '0') {
    throw new Error('SESSION_SECRET (32+ chars) is required in production');
  }
  return 'dev-only-insecure-session-secret-change-me-0000';
}

export type Session = { kind: 'diner'; phone: string; exp: number } | { kind: 'merchant'; branchId: string; exp: number };

function sign(payload: Session): string {
  const body = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const mac = createHmac('sha256', secret()).update(body).digest('base64url');
  return `${body}.${mac}`;
}

export function verify(token: string | undefined, now = Date.now()): Session | null {
  if (!token) return null;
  const [body, mac] = token.split('.');
  if (!body || !mac) return null;
  const expected = createHmac('sha256', secret()).update(body).digest();
  const given = Buffer.from(mac, 'base64url');
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const s = JSON.parse(Buffer.from(body, 'base64url').toString()) as Session;
    return s.exp > now ? s : null;
  } catch {
    return null;
  }
}

export function bearer(header: string | undefined): string | undefined {
  return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
}

export function dinerLogin(phone: string, otp: string, now = Date.now()) {
  if (otp !== DEMO_OTP) throw new ApiError('VALIDATION', 'wrong verification code');
  const exp = now + DINER_TTL_MS;
  return { token: sign({ kind: 'diner', phone, exp }), phone, expiresAt: new Date(exp).toISOString() };
}

export function merchantLogin(branchId: string, pin: string, now = Date.now()) {
  if (pin !== DEMO_MERCHANT_PIN) throw new ApiError('VALIDATION', 'wrong PIN');
  const exp = now + MERCHANT_TTL_MS;
  return { token: sign({ kind: 'merchant', branchId, exp }), branchId, expiresAt: new Date(exp).toISOString() };
}

export function requireDiner(header: string | undefined): string {
  const s = verify(bearer(header));
  if (!s || s.kind !== 'diner') throw new ApiError('UNAUTHORIZED', 'sign in with your phone first');
  return s.phone;
}

export function optionalDiner(header: string | undefined): string | undefined {
  const s = verify(bearer(header));
  return s && s.kind === 'diner' ? s.phone : undefined;
}

export function requireMerchant(header: string | undefined, branchId: string): void {
  const s = verify(bearer(header));
  if (!s || s.kind !== 'merchant' || s.branchId !== branchId) throw new ApiError('UNAUTHORIZED', 'restaurant sign-in required');
}
