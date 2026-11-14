export type ErrorCode =
  | 'NOT_FOUND'
  | 'VALIDATION'
  | 'TOTAL_CHANGED'
  | 'SHARE_UNAVAILABLE'
  | 'PAYMENT_IN_PROGRESS'
  | 'IDEMPOTENCY_MISMATCH'
  | 'IDEMPOTENCY_KEY_REQUIRED'
  | 'CASHBACK_UNAVAILABLE'
  | 'CONSENT_REQUIRED'
  | 'INVALID_SPLIT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN';

const STATUS: Record<ErrorCode, number> = {
  NOT_FOUND: 404,
  VALIDATION: 400,
  TOTAL_CHANGED: 409,
  SHARE_UNAVAILABLE: 409,
  PAYMENT_IN_PROGRESS: 409,
  IDEMPOTENCY_MISMATCH: 422,
  IDEMPOTENCY_KEY_REQUIRED: 400,
  CASHBACK_UNAVAILABLE: 409,
  CONSENT_REQUIRED: 400,
  INVALID_SPLIT: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
};

export class ApiError extends Error {
  readonly status: number;
  constructor(public readonly code: ErrorCode, message: string, public readonly details?: unknown) {
    super(message);
    this.status = STATUS[code];
  }
  toJSON() {
    return { code: this.code, message: this.message, details: this.details ?? null };
  }
}
