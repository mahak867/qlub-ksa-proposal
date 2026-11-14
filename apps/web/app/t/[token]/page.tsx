'use client';
import Link from 'next/link';
import { use, useEffect, useState } from 'react';
import { api, Bill } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ErrorNote, Money } from '../../shell';

export default function BillPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = use(params);
  const { t, locale } = useI18n();
  const [bill, setBill] = useState<Bill | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    api<Bill>(`/tables/${token}/bill`).then(setBill).catch((e) => setErr(e.message));
  }, [token]);

  if (err) return <ErrorNote message={err} />;
  if (!bill) return <p className="muted">…</p>;
  const name = (x: { nameAr: string; nameEn: string }) => (locale === 'ar' ? x.nameAr : x.nameEn);

  return (
    <>
      <p className="muted">
        {name(bill.restaurant)} · {name(bill.branch)} · {t('table')} {bill.table}
      </p>
      <div className="banner" role="note">
        <span aria-hidden>✓</span> {t('noAppNeeded')}
      </div>
      <div className="card">
        {bill.items.map((i) => (
          <div className="row" key={i.id}>
            <span>
              {i.quantity > 1 && <bdi>{i.quantity}× </bdi>}
              {name(i)}
            </span>
            <Money value={i.quantity * i.unitPrice} />
          </div>
        ))}
        <div className="row total">
          <span>
            {t('total')}
            <br />
            <small className="muted">{t('vatIncluded')}</small>
          </span>
          <Money value={bill.total} />
        </div>
        {bill.paid > 0 && (
          <div className="row">
            <span>{t('alreadyPaid')}</span>
            <Money value={bill.paid} />
          </div>
        )}
        {bill.reserved > 0 && (
          <div className="row">
            <span>{t('inProgress')}</span>
            <Money value={bill.reserved} />
          </div>
        )}
        {bill.paid + bill.reserved > 0 && (
          <div className="row total">
            <span>{t('leftToPay')}</span>
            <Money value={bill.remaining} />
          </div>
        )}
      </div>
      {bill.status === 'PAID' ? (
        <div className="banner">{t('billPaid')}</div>
      ) : (
        <Link className="btn" href={`/t/${token}/split`}>
          {t('payBill')}
        </Link>
      )}
    </>
  );
}
