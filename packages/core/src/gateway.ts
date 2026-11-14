/** Payment gateway boundary. Only a mock exists in this concept; no card data is handled. */
export type GatewayOutcome = 'APPROVE' | 'DECLINE' | 'HANG' | 'LATE_SUCCESS';

export interface ChargeRequest {
  reference: string; // our idempotency key, passed through
  amount: number;
  method: 'MADA' | 'APPLE_PAY';
}

export type ChargeResult = { status: 'CAPTURED' } | { status: 'DECLINED'; reason: string } | { status: 'PENDING' };

export type GatewayStatus = 'CAPTURED' | 'DECLINED' | 'NOT_FOUND' | 'PENDING';

export interface Gateway {
  charge(req: ChargeRequest): Promise<ChargeResult>;
  status(reference: string): Promise<GatewayStatus>;
  /** Void a pending charge. A real gateway may still capture if the void loses the race. */
  cancel(reference: string): Promise<void>;
}

/**
 * Scriptable mock. Idempotent on `reference`: charging the same reference twice
 * never creates a second capture.
 *  - APPROVE: captured at once
 *  - DECLINE: declined at once
 *  - HANG: stays pending; status stays PENDING until `settleLate`
 *  - LATE_SUCCESS: pending now; status reports CAPTURED only after `settleLate`
 */
export class MockGateway implements Gateway {
  mode: GatewayOutcome = 'APPROVE';
  readonly charges = new Map<string, { amount: number; status: GatewayStatus; outcome: GatewayOutcome }>();
  chargeCalls = 0;

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const existing = this.charges.get(req.reference);
    if (existing) return toResult(existing.status);
    this.chargeCalls++;
    const status: GatewayStatus = this.mode === 'APPROVE' ? 'CAPTURED' : this.mode === 'DECLINE' ? 'DECLINED' : 'PENDING';
    this.charges.set(req.reference, { amount: req.amount, status, outcome: this.mode });
    return toResult(status);
  }

  async status(reference: string): Promise<GatewayStatus> {
    return this.charges.get(reference)?.status ?? 'NOT_FOUND';
  }

  async cancel(reference: string): Promise<void> {
    const c = this.charges.get(reference);
    // HANG voids cleanly; LATE_SUCCESS simulates a capture that wins the race against the void.
    if (c && c.status === 'PENDING' && c.outcome === 'HANG') c.status = 'DECLINED';
  }

  /** Demo/test hook: a pending LATE_SUCCESS charge finally captures. */
  settleLate(reference: string): void {
    const c = this.charges.get(reference);
    if (c && c.status === 'PENDING') c.status = 'CAPTURED';
  }

  /** Demo/test hook: a HANG charge is finally declined. */
  settleDeclined(reference: string): void {
    const c = this.charges.get(reference);
    if (c && c.status === 'PENDING') c.status = 'DECLINED';
  }
}

function toResult(status: GatewayStatus): ChargeResult {
  if (status === 'CAPTURED') return { status: 'CAPTURED' };
  if (status === 'DECLINED') return { status: 'DECLINED', reason: 'declined_by_issuer' };
  return { status: 'PENDING' };
}
