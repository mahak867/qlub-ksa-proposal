'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useEffect, useState } from 'react';
import { api, PaymentView } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ErrorNote, Money } from '../../shell';

export default function PaymentStatus({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t } = useI18n();
  const router = useRouter();
  const [p, setP] = useState<PaymentView | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    let stop = false;
    const tick = async () => {
      try {
        const v = await api<PaymentView>(`/payments/${id}`);
        if (!stop) setP(v);
      } catch (e) {
        if (!stop) setErr((e as Error).message);
      }
    };
    tick();
    const poll = setInterval(tick, 2000);
    const clock = setInterval(() => setNow(Date.now()), 1000);
    return () => {
      stop = true;
      clearInterval(poll);
      clearInterval(clock);
    };
  }, [id]);

  if (err && !p) return <ErrorNote message={err} />;
  if (!p) return <p className="muted">…</p>;

  const left = Math.max(0, Math.ceil((new Date(p.deadlineAt).getTime() - now) / 1000));

  return (
    <div aria-live="polite">
      {p.status === 'PAID' && (
        <div className="status good">
          <div className="icon" aria-hidden>✓</div>
          <h1>{t('statusPaid')}</h1>
          <Money value={p.charge} big />
          <Link className="btn" href={`/pay/${p.id}/receipt`}>
            {t('viewReceipt')}
          </Link>
        </div>
      )}
      {p.status === 'CHECKING' && (
        <div className="status wait">
          <div className="icon spin" aria-hidden>◔</div>
          <h1>{t('statusChecking')}</h1>
          <p>
            {t('statusCheckingNote')} <bdi>{left}</bdi> {t('seconds')}.
          </p>
        </div>
      )}
      {p.status === 'NOT_CHARGED' && (
        <div className="status bad">
          <div className="icon" aria-hidden>!</div>
          <h1>{t('statusNotCharged')}</h1>
          <p>{t('statusNotChargedNote')}</p>
          <button className="btn" onClick={() => (p.retry === 'REVIEW' ? router.back() : router.push(`/t/${p.tableToken}/split`))}>
            {t('tryAgain')}
          </button>
        </div>
      )}
      {(p.status === 'REFUND_ON_ITS_WAY' || p.status === 'REFUNDED') && (
        <div className="status wait">
          <div className="icon" aria-hidden>↺</div>
          <h1>{p.status === 'REFUNDED' ? t('statusRefunded') : t('statusRefund')}</h1>
          <Money value={p.charge} big />
          <p>{t('statusRefundNote')}</p>
        </div>
      )}
      <p className="muted" style={{ textAlign: 'center' }}>
        {t('reference')}: <bdi dir="ltr">{p.reference}</bdi>
      </p>
    </div>
  );
}
