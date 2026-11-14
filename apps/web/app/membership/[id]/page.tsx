'use client';
import { use, useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ErrorNote, Money } from '../../shell';

interface Membership {
  id: string;
  status: 'ACTIVE' | 'CANCELLED';
  monthlyPrice: number;
  trialEndsAt: string;
  nextChargeAt: string | null;
  cancelledAt: string | null;
  consent: { version: string; text: string; locale: string; acceptedAt: string } | null;
}

export default function MembershipPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const [m, setM] = useState<Membership | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const date = (s: string) => new Date(s).toLocaleDateString(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  useEffect(() => {
    api<Membership>(`/memberships/${id}`).then(setM).catch((e) => setErr(e.message));
  }, [id]);

  if (err && !m) return <ErrorNote message={err} />;
  if (!m) return <p className="muted">…</p>;

  async function cancel() {
    setM(await api<Membership>(`/memberships/${id}`, { method: 'DELETE' }));
  }

  return (
    <>
      <h1>{t('membership')}</h1>
      <div className="card">
        <div className="row">
          <span>{t('membership')}</span>
          <span className={m.status === 'ACTIVE' ? 'pill good' : 'pill'}>{m.status === 'ACTIVE' ? t('active') : t('cancelled')}</span>
        </div>
        <div className="row">
          <span>{t('trialEnds')}</span>
          <span>{date(m.trialEndsAt)}</span>
        </div>
        {m.nextChargeAt && (
          <div className="row">
            <span>{t('nextCharge')}</span>
            <span>
              {date(m.nextChargeAt)} · <Money value={m.monthlyPrice} />
            </span>
          </div>
        )}
      </div>
      {m.status === 'ACTIVE' ? (
        <button className="btn secondary" onClick={cancel}>
          {t('cancelOneTap')}
        </button>
      ) : (
        <div className="banner">{t('cancelledNote')}</div>
      )}
      {m.consent && (
        <div className="card">
          <h2 style={{ marginTop: 0 }}>{t('consentRecord')}</h2>
          <p>{m.consent.text}</p>
          <p className="muted">
            v{m.consent.version} · {new Date(m.consent.acceptedAt).toISOString()}
          </p>
        </div>
      )}
    </>
  );
}
