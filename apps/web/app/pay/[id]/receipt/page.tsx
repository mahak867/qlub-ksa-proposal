'use client';
import Link from 'next/link';
import QRCode from 'qrcode';
import { use, useEffect, useState } from 'react';
import { api, ApiFailure, errorText, getSessionPhone, PaymentView } from '@/lib/api';
import { SignIn } from '../../../signin';
import { useI18n } from '@/lib/i18n';
import { ErrorNote, Money } from '../../../shell';

interface Invoice {
  number: string;
  issuedAt: string;
  seller: { nameAr: string; nameEn: string; vatNumber: string };
  total: number;
  vat: number;
  net: number;
  qrBase64: string;
}

interface Terms {
  version: string;
  monthlyPrice: number;
  trialDays: number;
  text: string;
}

export default function Receipt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { t, locale } = useI18n();
  const [p, setP] = useState<PaymentView | null>(null);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<PaymentView>(`/payments/${id}`)
      .then(async (v) => {
        setP(v);
        if (v.billPaid) {
          const i = await api<Invoice>(`/bills/${v.billId}/invoice`);
          setInv(i);
          setQr(await QRCode.toDataURL(i.qrBase64, { margin: 1, width: 360 }));
        }
      })
      .catch((e) => setErr(e.message));
  }, [id]);

  if (err && !p) return <ErrorNote message={err} />;
  if (!p) return <p className="muted">…</p>;

  return (
    <>
      <h1>{t('receipt')}</h1>
      <p className="muted">{t('receiptNote')}</p>
      <div className="card">
        <div className="row">
          <span>{t('share')}</span>
          <Money value={p.amount} />
        </div>
        {p.cashbackUsed > 0 && (
          <div className="row">
            <span>{t('cashbackUsed')}</span>
            <span>
              − <Money value={p.cashbackUsed} />
            </span>
          </div>
        )}
        <div className="row">
          <span>{t('tip')}</span>
          <Money value={p.tip} />
        </div>
        <div className="row total">
          <span>{t('charged')}</span>
          <Money value={p.charge} />
        </div>
        <div className="row">
          <span>{t('reference')}</span>
          <bdi dir="ltr">{p.reference}</bdi>
        </div>
      </div>

      <div className="card">
        <h2 style={{ marginTop: 0 }}>{t('taxInvoice')}</h2>
        {inv ? (
          <>
            <div className="row">
              <span>{t('invoiceNo')}</span>
              <bdi dir="ltr">{inv.number}</bdi>
            </div>
            <div className="row">
              <span>{locale === 'ar' ? inv.seller.nameAr : inv.seller.nameEn}</span>
              <bdi dir="ltr">{inv.seller.vatNumber}</bdi>
            </div>
            <div className="row">
              <span>{t('vat')} 15%</span>
              <Money value={inv.vat} />
            </div>
            <div className="row total">
              <span>{t('total')}</span>
              <Money value={inv.total} />
            </div>
            {qr && <img className="qr" src={qr} alt="ZATCA QR" />}
            <p className="muted">{t('mockQr')}</p>
          </>
        ) : (
          <p className="muted">{t('invoicePending')}</p>
        )}
      </div>

      {p.status === 'PAID' && <MembershipOffer paymentId={p.id} />}
    </>
  );
}

/** Shown only AFTER a successful payment. Nothing pre-ticked; skipping changes nothing. */
function MembershipOffer({ paymentId }: { paymentId: string }) {
  const { t, locale } = useI18n();
  const [terms, setTerms] = useState<Terms | null>(null);
  const [state, setState] = useState<'idle' | 'form' | 'dismissed'>('idle');
  const [signedIn, setSignedIn] = useState(false);
  const [agree, setAgree] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [joined, setJoined] = useState<string | null>(null);

  useEffect(() => {
    api<Terms>(`/memberships/terms?locale=${locale}`).then(setTerms).catch(() => {});
  }, [locale]);

  if (!terms || state === 'dismissed') return null;
  if (joined)
    return (
      <div className="card offer">
        <p>✓ {t('membership')}</p>
        <Link className="btn secondary" href={`/membership/${joined}`}>
          {t('membership')}
        </Link>
      </div>
    );

  async function join() {
    setErr(null);
    try {
      const m = await api<{ id: string }>('/memberships', {
        method: 'POST',
        json: { consent: agree, textVersion: terms!.version, locale, paymentId },
      });
      setJoined(m.id);
    } catch (e) {
      setErr(e instanceof ApiFailure ? errorText(e.code, locale, e.message) : String(e));
    }
  }

  return (
    <section className="card offer" aria-labelledby="offer-title">
      <h2 id="offer-title" style={{ marginTop: 0 }}>
        {t('offerTitle')}
      </h2>
      <p className="muted">{t('offerSub')}</p>
      <p>{terms.text}</p>
      {state === 'idle' ? (
        <div className="btnrow">
          <button className="btn secondary" onClick={() => setState('dismissed')}>
            {t('noThanks')}
          </button>
          <button className="btn secondary" onClick={() => setState('form')}>
            {t('join')}
          </button>
        </div>
      ) : (
        <>
          {!(signedIn || getSessionPhone()) && <SignIn onDone={() => setSignedIn(true)} />}
          <label className="check">
            <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} />
            <span>{t('agree')}</span>
          </label>
          <ErrorNote message={err} />
          <div className="btnrow">
            <button className="btn secondary" onClick={() => setState('dismissed')}>
              {t('noThanks')}
            </button>
            <button className="btn" disabled={!agree || !(signedIn || getSessionPhone())} onClick={join}>
              {t('join')}
            </button>
          </div>
        </>
      )}
    </section>
  );
}
