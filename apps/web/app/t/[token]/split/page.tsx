'use client';
import { useRouter } from 'next/navigation';
import { use, useEffect, useMemo, useState } from 'react';
import { equalParts } from '@qlub-pay/core';
import { api, ApiFailure, Bill, errorText, Share } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ErrorNote, Money } from '../../../shell';

type Mode = 'WHOLE' | 'ITEMS' | 'EQUAL' | 'CUSTOM';

export default function SplitPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, locale } = useI18n();
  const router = useRouter();
  const [bill, setBill] = useState<Bill | null>(null);
  const [mode, setMode] = useState<Mode>('WHOLE');
  const [people, setPeople] = useState(2);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [custom, setCustom] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Bill>(`/tables/${token}/bill`)
      .then((b) => {
        setBill(b);
        if (b.splitMode === 'EQUAL' && b.equalCount) {
          setMode('EQUAL');
          setPeople(b.equalCount);
        } else if (b.splitMode && b.splitMode !== 'WHOLE') setMode(b.splitMode);
      })
      .catch((e) => setErr(e.message));
  }, [token]);

  const locked = bill?.splitMode && bill.splitMode !== 'WHOLE' && bill.paid + bill.reserved > 0 ? bill.splitMode : null;

  const preview = useMemo(() => {
    if (!bill) return 0;
    switch (mode) {
      case 'WHOLE':
        return bill.remaining;
      case 'ITEMS':
        return bill.items.reduce((a, i) => a + (qty[i.id] ?? 0) * i.unitPrice, 0);
      case 'EQUAL':
        return equalParts(bill.total, Math.max(1, people))[0];
      case 'CUSTOM':
        return Math.round(parseFloat(custom || '0') * 100) || 0;
    }
  }, [bill, mode, qty, people, custom]);

  if (err && !bill) return <ErrorNote message={err} />;
  if (!bill) return <p className="muted">…</p>;
  const name = (x: { nameAr: string; nameEn: string }) => (locale === 'ar' ? x.nameAr : x.nameEn);

  async function go() {
    if (!bill) return;
    setBusy(true);
    setErr(null);
    try {
      const body =
        mode === 'ITEMS'
          ? { mode, items: Object.entries(qty).filter(([, q]) => q > 0).map(([itemId, quantity]) => ({ itemId, quantity })) }
          : mode === 'EQUAL'
            ? { mode, people }
            : mode === 'CUSTOM'
              ? { mode, amount: preview }
              : { mode };
      const share = await api<Share>(`/bills/${bill.id}/shares`, { method: 'POST', json: body });
      router.push(`/t/${token}/review?share=${share.id}`);
    } catch (e) {
      setErr(e instanceof ApiFailure ? errorText(e.code, locale, e.message) : (e as Error).message);
      setBusy(false);
    }
  }

  const options: { m: Mode; label: string }[] = [
    { m: 'WHOLE', label: t('payRest') },
    { m: 'ITEMS', label: t('byItem') },
    { m: 'EQUAL', label: t('equal') },
    { m: 'CUSTOM', label: t('custom') },
  ];

  return (
    <>
      <h1>{t('howToPay')}</h1>
      <p className="muted">
        {t('leftToPay')}: <Money value={bill.remaining} />
      </p>
      <div className="grid2" role="group">
        {options.map((o) => (
          <button key={o.m} className="opt" aria-pressed={mode === o.m} disabled={!!locked && o.m !== 'WHOLE' && o.m !== locked} onClick={() => setMode(o.m)}>
            <strong>{o.label}</strong>
          </button>
        ))}
      </div>

      {mode === 'ITEMS' && (
        <div className="card">
          {bill.items.map((i) => {
            const free = i.quantity - i.claimed;
            const q = qty[i.id] ?? 0;
            return (
              <div className="item" key={i.id}>
                <span className="name">
                  {name(i)} <br />
                  <Money value={i.unitPrice} /> {free < i.quantity && <small className="muted">· {free}/{i.quantity}</small>}
                </span>
                <span className="stepper">
                  <button aria-label={locale === 'ar' ? `أقل من ${name(i)}` : `One less ${name(i)}`} onClick={() => setQty({ ...qty, [i.id]: Math.max(0, q - 1) })} disabled={q === 0}>
                    −
                  </button>
                  <bdi aria-live="polite">{q}</bdi>
                  <button aria-label={locale === 'ar' ? `أكثر من ${name(i)}` : `One more ${name(i)}`} onClick={() => setQty({ ...qty, [i.id]: Math.min(free, q + 1) })} disabled={q >= free}>
                    +
                  </button>
                </span>
              </div>
            );
          })}
        </div>
      )}

      {mode === 'EQUAL' && (
        <div className="card">
          <p>{t('people')}</p>
          <div className="chips">
            {[2, 3, 4, 5, 6].map((n) => (
              <button key={n} className="chip" aria-pressed={people === n} disabled={!!bill.equalCount && bill.reserved + bill.paid > 0} onClick={() => setPeople(n)}>
                {n}
              </button>
            ))}
          </div>
        </div>
      )}

      {mode === 'CUSTOM' && (
        <label className="field">
          <span>{t('custom')} (SAR)</span>
          <input type="number" inputMode="decimal" min="0.01" step="0.01" value={custom} onChange={(e) => setCustom(e.target.value)} />
        </label>
      )}

      <div className="card">
        <div className="row total">
          <span>{t('yourShare')}</span>
          <Money value={preview} />
        </div>
      </div>
      <ErrorNote message={err} />
      <button className="btn" disabled={busy || preview < 1} onClick={go}>
        {t('continue')}
      </button>
    </>
  );
}
