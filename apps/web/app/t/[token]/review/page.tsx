'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, use, useEffect, useRef, useState } from 'react';
import { computeCharge, TIP_PRESETS_PERCENT, tipFromPercent } from '@qlub-pay/core';
import { api, ApiFailure, Bill, newIdempotencyKey, PaymentView } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ErrorNote, Money } from '../../../shell';

type TipChoice = { kind: 'none' } | { kind: 'percent'; p: number } | { kind: 'other' };

function Review({ token }: { token: string }) {
  const q = useSearchParams();
  const shareId = q.get('share') ?? '';
  const share = Number(q.get('amount') ?? 0);
  const { t, locale } = useI18n();
  const router = useRouter();
  const [bill, setBill] = useState<Bill | null>(null);
  // The default is NO tip. Nothing is pre-selected, and choosing "no tip" never asks "are you sure?".
  const [tipChoice, setTipChoice] = useState<TipChoice>({ kind: 'none' });
  const [otherTip, setOtherTip] = useState('');
  const [useCb, setUseCb] = useState(false);
  const [phone, setPhone] = useState('');
  const [balance, setBalance] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingKey = useRef<string | null>(null);

  useEffect(() => {
    api<Bill>(`/tables/${token}/bill`).then(setBill).catch(() => {});
  }, [token]);

  const tip =
    tipChoice.kind === 'percent' ? tipFromPercent(share, tipChoice.p) : tipChoice.kind === 'other' ? Math.max(0, Math.round(parseFloat(otherTip || '0') * 100) || 0) : 0;
  const cashbackUse = useCb && balance ? Math.min(balance, share) : 0;
  let breakdown = { share, tip, cashbackUsed: cashbackUse, charge: share + tip - cashbackUse };
  try {
    breakdown = computeCharge(share, tip, cashbackUse);
  } catch {}

  async function lookupBalance() {
    setErr(null);
    try {
      const w = await api<{ balance: number }>(`/cashback?phone=${encodeURIComponent(phone)}`);
      setBalance(w.balance);
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  async function pay(method: 'MADA' | 'APPLE_PAY') {
    setBusy(true);
    setErr(null);
    // One key per press, reused only if the network drops and the diner presses again.
    if (!pendingKey.current) pendingKey.current = newIdempotencyKey();
    try {
      const p = await api<PaymentView>('/payments', {
        method: 'POST',
        idempotencyKey: pendingKey.current,
        json: {
          shareId,
          tip: breakdown.tip,
          cashbackUse: breakdown.cashbackUsed,
          method,
          expectedTotal: breakdown.charge,
          ...(breakdown.cashbackUsed > 0 ? { phone } : {}),
        },
      });
      router.push(`/pay/${p.id}`);
    } catch (e) {
      if (e instanceof ApiFailure) {
        pendingKey.current = null; // the server answered; nothing was charged
        if (e.code === 'TOTAL_CHANGED') setErr(t('totalChanged'));
        else if (e.code === 'SHARE_UNAVAILABLE') router.push(`/t/${token}/split`);
        else setErr(e.message);
      } else {
        setErr(locale === 'ar' ? 'انقطع الاتصال. اضغط مرة أخرى؛ لن يتم الخصم مرتين.' : 'Connection lost. Press again; you will not be charged twice.');
      }
      setBusy(false);
    }
  }

  const accepts = bill?.branch.acceptsCashback;

  return (
    <>
      <h1>{t('review')}</h1>
      <div className="card">
        <div className="row">
          <span>{t('yourShare')}</span>
          <Money value={share} />
        </div>
        <small className="muted">{t('vatIncluded')}</small>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }} id="tip-label">
          {t('tip')}
        </h2>
        <div className="chips" role="group" aria-labelledby="tip-label">
          <button className="chip" aria-pressed={tipChoice.kind === 'none'} onClick={() => setTipChoice({ kind: 'none' })}>
            {t('noTip')}
          </button>
          {TIP_PRESETS_PERCENT.map((p) => (
            <button key={p} className="chip" aria-pressed={tipChoice.kind === 'percent' && tipChoice.p === p} onClick={() => setTipChoice({ kind: 'percent', p })}>
              <bdi>{p}%</bdi>
            </button>
          ))}
          <button className="chip" aria-pressed={tipChoice.kind === 'other'} onClick={() => setTipChoice({ kind: 'other' })}>
            {t('otherAmount')}
          </button>
        </div>
        {tipChoice.kind === 'other' && (
          <label className="field">
            <span>SAR</span>
            <input type="number" inputMode="decimal" min="0" step="0.01" value={otherTip} onChange={(e) => setOtherTip(e.target.value)} />
          </label>
        )}
        <p className="muted">{t('tipNote')}</p>
      </div>

      <div className="card">
        {accepts ? (
          <>
            <label className="check">
              <input type="checkbox" checked={useCb} onChange={(e) => setUseCb(e.target.checked)} />
              <span>{t('useCashback')}</span>
            </label>
            {useCb && (
              <>
                <label className="field">
                  <span>{t('phoneForCashback')}</span>
                  <input type="tel" dir="ltr" placeholder="+9665XXXXXXXX" value={phone} onChange={(e) => setPhone(e.target.value)} />
                </label>
                <button className="btn secondary" onClick={lookupBalance} disabled={!phone}>
                  {t('check')}
                </button>
                {balance !== null && (
                  <p>
                    {t('balance')}: <Money value={balance} />
                  </p>
                )}
              </>
            )}
          </>
        ) : (
          <p className="muted">{t('cashbackNotHere')}</p>
        )}
      </div>

      <div className="card" aria-live="polite">
        <div className="row">
          <span>{t('yourShare')}</span>
          <Money value={breakdown.share} />
        </div>
        {breakdown.cashbackUsed > 0 && (
          <div className="row">
            <span>{t('cashbackUsed')}</span>
            <span>
              − <Money value={breakdown.cashbackUsed} />
            </span>
          </div>
        )}
        <div className="row">
          <span>{t('tip')}</span>
          <Money value={breakdown.tip} />
        </div>
        <div className="status" style={{ padding: '16px 0 4px' }}>
          <p className="muted">{t('youPay')}</p>
          <Money value={breakdown.charge} big />
          <p className="muted">{t('noOtherFees')}</p>
        </div>
      </div>

      <ErrorNote message={err} />
      <button className="btn" disabled={busy || !shareId} onClick={() => pay('MADA')}>
        {t('payMada')} · <Money value={breakdown.charge} />
      </button>
      <button className="btn dark" disabled={busy || !shareId} onClick={() => pay('APPLE_PAY')}>
        {t('payApple')} · <Money value={breakdown.charge} />
      </button>
      <p className="muted" style={{ textAlign: 'center' }}>
        {t('demoPayment')}
      </p>
    </>
  );
}

export default function ReviewPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  return (
    <Suspense fallback={<p className="muted">…</p>}>
      <Review token={token} />
    </Suspense>
  );
}
