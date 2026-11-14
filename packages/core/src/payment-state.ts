export type PaymentState = 'CREATED' | 'PROCESSING' | 'SUCCEEDED' | 'FAILED' | 'EXPIRED' | 'REFUND_DUE' | 'REFUNDED';

/** Hard deadline for PROCESSING. Nothing may stay "ongoing" longer. */
export const PROCESSING_DEADLINE_MS = 90_000;

const TRANSITIONS: Record<PaymentState, PaymentState[]> = {
  CREATED: ['PROCESSING', 'FAILED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'EXPIRED'],
  // A late success for a payment we already gave up on: accept it (share still free)
  // or mark it for refund (someone else paid). Never keep money without a paid share.
  FAILED: ['SUCCEEDED', 'REFUND_DUE'],
  EXPIRED: ['SUCCEEDED', 'REFUND_DUE'],
  REFUND_DUE: ['REFUNDED'],
  SUCCEEDED: [],
  REFUNDED: [],
};

export const FINAL_STATES: ReadonlySet<PaymentState> = new Set(['SUCCEEDED', 'FAILED', 'EXPIRED', 'REFUNDED']);

/** States in which a payment still holds its share reservation. */
export const ACTIVE_STATES: ReadonlySet<PaymentState> = new Set(['CREATED', 'PROCESSING']);

export function canTransition(from: PaymentState, to: PaymentState): boolean {
  return TRANSITIONS[from].includes(to);
}

export class IllegalTransitionError extends Error {
  constructor(from: PaymentState, to: PaymentState) {
    super(`illegal payment transition ${from} → ${to}`);
  }
}

export function assertTransition(from: PaymentState, to: PaymentState): void {
  if (!canTransition(from, to)) throw new IllegalTransitionError(from, to);
}

/** What the diner sees for each state (§5.5). */
export type DinerStatus = 'PAID' | 'CHECKING' | 'NOT_CHARGED' | 'REFUND_ON_ITS_WAY' | 'REFUNDED';

export function dinerStatus(state: PaymentState): DinerStatus {
  switch (state) {
    case 'SUCCEEDED':
      return 'PAID';
    case 'CREATED':
    case 'PROCESSING':
      return 'CHECKING';
    case 'FAILED':
    case 'EXPIRED':
      return 'NOT_CHARGED';
    case 'REFUND_DUE':
      return 'REFUND_ON_ITS_WAY';
    case 'REFUNDED':
      return 'REFUNDED';
  }
}
