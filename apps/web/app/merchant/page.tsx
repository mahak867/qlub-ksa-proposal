'use client';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { api, ApiFailure, getToken, setToken } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ErrorNote, Money } from '../shell';

interface Overview {
  branch: { id: string; nameAr: string; nameEn: string; city: string; restaurantEn: string };
  tables: {
    label: string;
    bill: null | {
      id: string;
      status: string;
      total: number;
      paid: number;
      tips: number;
      cashbackRedeemed: number;
      reconciled: boolean;
      payments: { id: string; state: string; amount: number; tip: number; at: string }[];
      invoice: { number: string; reportStatus: string; reportDeadline: string } | null;
    };
  }[];
  metrics: { funnel: Record<string, number>; tipRate: number | null; stuckPayments: number };
}
interface Sync {
  status: 'GREEN' | 'AMBER' | 'RED';
  lastSyncAt: string;
  priceChanged: { posCode: string; name: string; stored: number; pos: number }[];
  missing: { posCode: string; name: string; pos: number }[];
  unmappedTables: string[];
  note: string;
}

const pillFor = (state: string) => (state === 'SUCCEEDED' ? 'good' : state === 'PROCESSING' || state === 'REFUND_DUE' ? 'warn' : state === 'REFUNDED' ? '' : 'bad');

function Merchant() {
  const q = useSearchParams();
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const [branchId, setBranchId] = useState(q.get('branch') ?? '');
  const [o, setO] = useState<Overview | null>(null);
  const [s, setS] = useState<Sync | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!branchId) api<{ branchId: string }>('/demo/info').then((i) => setBranchId(i.branchId)).catch((e) => setErr(e.message));
  }, [branchId]);

  const [authed, setAuthed] = useState(false);
  const [pin, setPin] = useState('');
  useEffect(() => {
    if (getToken('merchant')) setAuthed(true);
  }, []);

  async function signIn() {
    setErr(null);
    try {
      const r = await api<{ token: string; expiresAt: string; branchId: string }>('/auth/merchant', { method: 'POST', json: { branchId, pin } });
      setToken('merchant', r);
      setAuthed(true);
    } catch {
      setErr(ar ? 'رقم سري غير صحيح.' : 'Wrong PIN.');
    }
  }

  useEffect(() => {
    if (!branchId || !authed) return;
    const auth = getToken('merchant');
    const onErr = (e: unknown) => {
      if (e instanceof ApiFailure && e.status === 401) {
        setToken('merchant', null);
        setAuthed(false);
      } else setErr((e as Error).message);
    };
    const load = () => {
      api<Overview>(`/merchant/branches/${branchId}/overview`, { auth }).then(setO).catch(onErr);
      api<Sync>(`/merchant/branches/${branchId}/sync-health`, { auth }).then(setS).catch(() => {});
    };
    load();
    const i = setInterval(load, 3000);
    return () => clearInterval(i);
  }, [branchId, authed]);

  if (!authed)
    return (
      <>
        <h1>{ar ? 'دخول المطعم' : 'Restaurant sign-in'}</h1>
        <label className="field">
          <span>{ar ? 'الرقم السري' : 'PIN'} (demo: 2468)</span>
          <input type="password" inputMode="numeric" dir="ltr" value={pin} onChange={(e) => setPin(e.target.value.replace(/\D/g, ''))} />
        </label>
        <button className="btn" disabled={!branchId || pin.length < 4} onClick={signIn}>
          {ar ? 'دخول' : 'Sign in'}
        </button>
        <ErrorNote message={err} />
      </>
    );
  if (err && !o) return <ErrorNote message={err} />;
  if (!o) return <p className="muted">…</p>;
  const f = o.metrics.funnel;

  return (
    <div>
      <h1>{ar ? 'شاشة المطعم' : 'Restaurant view'}</h1>
      <p className="muted">
        {o.branch.restaurantEn} · {ar ? o.branch.nameAr : o.branch.nameEn} · {o.branch.city}
      </p>

      {o.tables.map((tb) => (
        <div className="card" key={tb.label}>
          <div className="row">
            <strong>
              {ar ? 'طاولة' : 'Table'} {tb.label}
            </strong>
            {tb.bill && <span className={tb.bill.status === 'PAID' ? 'pill good' : 'pill warn'}>{tb.bill.status}</span>}
          </div>
          {tb.bill ? (
            <>
              <div className="row">
                <span>{ar ? 'المدفوع / الإجمالي' : 'Paid / total'}</span>
                <span>
                  <Money value={tb.bill.paid} /> / <Money value={tb.bill.total} />
                </span>
              </div>
              <div className="row">
                <span>{ar ? 'الإكراميات' : 'Tips'}</span>
                <Money value={tb.bill.tips} />
              </div>
              <div className="row">
                <span>{ar ? 'المطابقة' : 'Reconciliation'}</span>
                <span className={tb.bill.reconciled ? 'pill good' : 'pill bad'}>{tb.bill.reconciled ? (ar ? 'متطابقة' : 'Matches') : ar ? 'غير متطابقة' : 'Mismatch'}</span>
              </div>
              {tb.bill.invoice && (
                <div className="row">
                  <span>
                    {tb.bill.invoice.number}
                    <br />
                    <small className="muted">
                      {ar ? 'موعد الإبلاغ لهيئة الزكاة' : 'ZATCA reporting due'}: {new Date(tb.bill.invoice.reportDeadline).toLocaleString()}
                    </small>
                  </span>
                  <span className="pill warn">{tb.bill.invoice.reportStatus}</span>
                </div>
              )}
              {tb.bill.payments.length > 0 && (
                <table className="t">
                  <tbody>
                    {tb.bill.payments.map((p) => (
                      <tr key={p.id}>
                        <td>
                          <span className={`pill ${pillFor(p.state)}`}>{p.state}</span>
                        </td>
                        <td>
                          <Money value={p.amount} />
                        </td>
                        <td className="muted">+{(p.tip / 100).toFixed(2)}</td>
                        <td className="muted">{new Date(p.at).toLocaleTimeString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          ) : (
            <p className="muted">—</p>
          )}
        </div>
      ))}

      {s && (
        <div className="card">
          <div className="row">
            <strong>{ar ? 'مزامنة القائمة مع نظام نقاط البيع' : 'Menu sync with POS'}</strong>
            <span className={`pill ${s.status === 'GREEN' ? 'good' : s.status === 'AMBER' ? 'warn' : 'bad'}`}>{s.status}</span>
          </div>
          {s.priceChanged.map((x) => (
            <div className="row" key={x.posCode}>
              <span>
                {x.name} — {ar ? 'تغيّر السعر' : 'price changed'}
              </span>
              <span>
                <Money value={x.stored} /> → <Money value={x.pos} />
              </span>
            </div>
          ))}
          {s.missing.map((x) => (
            <div className="row" key={x.posCode}>
              <span>
                {x.name} — {ar ? 'غير موجود في القائمة' : 'missing from menu'}
              </span>
              <Money value={x.pos} />
            </div>
          ))}
          {s.unmappedTables.length > 0 && (
            <div className="row">
              <span>{ar ? 'طاولات بلا ربط' : 'Tables not mapped to POS'}</span>
              <span>{s.unmappedTables.join(', ')}</span>
            </div>
          )}
          <p className="muted">{s.note}</p>
        </div>
      )}

      <div className="card">
        <strong>{ar ? 'مؤشرات التجربة' : 'Pilot metrics'}</strong>
        <div className="row">
          <span>{ar ? 'فواتير معروضة → مدفوعات ناجحة' : 'Bills viewed → payments succeeded'}</span>
          <span>
            <bdi>{f.bill_viewed}</bdi> → <bdi>{f.payment_succeeded}</bdi>
          </span>
        </div>
        <div className="row">
          <span>{ar ? 'نسبة الدفعات مع إكرامية' : 'Payments with a tip'}</span>
          <bdi>{o.metrics.tipRate === null ? '—' : `${Math.round(o.metrics.tipRate * 100)}%`}</bdi>
        </div>
        <div className="row">
          <span>{ar ? 'فشل / انتهت المهلة / استرداد' : 'Failed / expired / refunds'}</span>
          <bdi>
            {f.payment_failed} / {f.payment_expired} / {f.refund_due}
          </bdi>
        </div>
        <div className="row">
          <span>{ar ? 'مدفوعات عالقة' : 'Stuck payments'}</span>
          <span className={o.metrics.stuckPayments ? 'pill bad' : 'pill good'}>{o.metrics.stuckPayments}</span>
        </div>
        <div className="row">
          <span>{ar ? 'انضمام / إلغاء العضوية' : 'Membership joins / cancels'}</span>
          <bdi>
            {f.membership_joined} / {f.membership_cancelled}
          </bdi>
        </div>
      </div>
    </div>
  );
}

export default function MerchantPage() {
  return (
    <Suspense fallback={<p className="muted">…</p>}>
      <Merchant />
    </Suspense>
  );
}
