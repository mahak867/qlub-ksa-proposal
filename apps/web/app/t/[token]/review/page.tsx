'use client';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, use, useEffect, useRef, useState } from 'react';
import { computeCharge, TIP_PRESETS_PERCENT, tipFromPercent } from '@qlub-pay/core';
import { api, ApiFailure, errorText, getSessionPhone, newIdempotencyKey, PaymentView } from '@/lib/api';
import { SignIn, SignedInAs } from '../../../signin';
import { useI18n } from '@/lib/i18n';
import { ErrorNote, Money } from '../../../shell';

type TipChoice = { kind: 'none' } | { kind: 'percent'; p: number } | { kind: 'other' };

function Review({ token }: { token: string }) {
  const q = useSearchParams();
  const shareId = q.get('share') ?? '';
  // The share amount always comes from the server, never from the URL.
  const [share, setShare] = useState<number | null>(null);
  const [accepts, setAccepts] = useState<boolean | null>(null);
  const { t, locale } = useI18n();
  const router = useRouter();
  // The default is NO tip. Nothing is pre-selected, and choosing "no tip" never asks "are you sure?".
  const [tipChoice, setTipChoice] = useState<TipChoice>({ kind: 'none' });
  const [otherTip, setOtherTip] = useState('');
  const [useCb, setUseCb] = useState(false);
  const [signedIn, setSignedIn] = useState(false);
  const [showSignIn, setShowSignIn] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const pendingKey = useRef<string | null>(null);

  useEffect(() => {
    api<{ amount: number; status: string; acceptsCashback: boolean }>(`/shares/${shareId}`)
      .then((s) => {
        if (s.status !== 'RESERVED') return router.replace(`/t/${token}/split`);
        setShare(s.amount);
        setAccepts(s.acceptsCashback);
      })
      .catch(() => router.replace(`/t/${token}/split`));
  }, [shareId, token, router]);

  const amount = share ?? 0;
  const tip =
    tipChoice.kind === 'percent' ? tipFromPercent(amount, tipChoice.p) : tipChoice.kind === 'other' ? Math.max(0, Math.round(parseFloat(otherTip || '0') * 100) || 0) : 0;
  const cashbackUse = useCb && balance ? Math.min(balance, amount) : 0;
  let breakdown = { share: amount, tip, cashbackUsed: cashbackUse, charge: amount + tip - cashbackUse };
  let invalid = share === null;
  try {
    breakdown = computeCharge(amount, tip, cashbackUse);
  } catch {
    invalid = true;
  }

  // Signing in is optional: it lets the diner earn cashback, and spend it where accepted.
  useEffect(() => {
    if (!getSessionPhone()) return;
    setSignedIn(true);
    api<{ balance: number }>('/cashback')
      .then((w) => setBalance(w.balance))
      .catch(() => setSignedIn(false));
  }, [showSignIn]);

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
        },
      });
      router.push(`/pay/${p.id}?t=${encodeURIComponent(token)}`);
    } catch (e) {
      const keepKey = !(e instanceof ApiFailure) || e.status >= 500 || e.code === 'PAYMENT_IN_PROGRESS';
      if (e instanceof ApiFailure && !keepKey) {
        pendingKey.current = null; // the server answered and nothing was charged
        if (e.code === 'TOTAL_CHANGED') {
          const d = e.details as { share?: number } | null;
          if (d?.share !== undefined) setShare(d.share); // show the server's numbers, then ask again
          setErr(t('totalChanged'));
        } else if (e.code === 'SHARE_UNAVAILABLE') router.push(`/t/${token}/split`);
        else setErr(errorText(e.code, locale, e.message));
      } else if (e instanceof ApiFailure && e.code === 'PAYMENT_IN_PROGRESS') {
        setErr(errorText(e.code, locale, e.message)); // same key kept: pressing again shows the same payment
      } else {
        setErr(locale === 'ar' ? 'انقطع الاتصال. اضغط مرة أخرى؛ لن يتم الخصم مرتين.' : 'Connection lost. Press again; you will not be charged twice.');
      }
      setBusy(false);
    }
  }


  return (
    <>
      <h1>{t('review')}</h1>
      <div className="card">
        <div className="row">
          <span>{t('yourShare')}</span>
          <Money value={amount} />
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
        {!signedIn ? (
          showSignIn ? (
            <SignIn why={locale === 'ar' ? 'اختياري: سجّل لتكسب الكاش باك أو تستخدمه.' : 'Optional: sign in to earn or use cashback.'} onDone={() => setShowSignIn(false)} />
          ) : (
            <button className="btn secondary" onClick={() => setShowSignIn(true)}>
              {locale === 'ar' ? 'اكسب الكاش باك (اختياري)' : 'Earn cashback (optional)'}
            </button>
          )
        ) : (
          <>
            <SignedInAs onSignOut={() => { setSignedIn(false); setUseCb(false); setBalance(null); }} />
            {balance !== null && (
              <p>
                {t('balance')}: <Money value={balance} />
              </p>
            )}
            {accepts && !!balance && (
              <label className="check">
                <input type="checkbox" checked={useCb} onChange={(e) => setUseCb(e.target.checked)} />
                <span>{t('useCashback')}</span>
              </label>
            )}
          </>
        )}
        {accepts === false ? (          <p className="muted">{t('cashbackNotHere')}</p>
        ) : null}
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
      <button className="btn" disabled={busy || invalid} onClick={() => pay('MADA')}>
        {t('payMada')} · <Money value={breakdown.charge} />
      </button>
      <button className="btn dark" disabled={busy || invalid} onClick={() => pay('APPLE_PAY')}>
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
