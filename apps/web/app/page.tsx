'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';

export default function Home() {
  const { locale } = useI18n();
  const [info, setInfo] = useState<{ token: string; branchId: string } | null>(null);
  const [err, setErr] = useState(false);
  useEffect(() => {
    api<{ token: string; branchId: string }>('/demo/info').then(setInfo).catch(() => setErr(true));
  }, []);
  const ar = locale === 'ar';
  return (
    <>
      <h1>{ar ? 'دفع واضح على الطاولة' : 'Clear pay-at-table'}</h1>
      <p className="muted">
        {ar
          ? 'مفهوم مستقل يعالج ما يذكره المستخدمون في المراجعات العامة: خلط الدفع بتطبيق المكافآت، الرسوم والإكرامية التي تظهر متأخرة، المدفوعات العالقة، والكاش باك الذي لا يمكن استخدامه.'
          : 'An independent concept that addresses what diners report in public reviews: paying confused with the rewards app, tips and fees that appear late, stuck payments, and cashback that can’t be used.'}
      </p>
      {err && <p className="error">{ar ? 'تعذر الوصول إلى الخادم التجريبي.' : 'Could not reach the demo API.'}</p>}
      <Link className="btn" href={info ? `/t/${info.token}` : '#'} aria-disabled={!info}>
        {ar ? 'امسح طاولة 12 (تجريبي)' : 'Scan table 12 (demo)'}
      </Link>
      <div className="card">
        <h2>{ar ? 'أربعة وعود' : 'Four promises'}</h2>
        <ol>
          <li>{ar ? 'المبلغ الذي تراجعه هو ما يُخصم.' : 'The amount you review is the amount you are charged.'}</li>
          <li>{ar ? 'الدفع لا يشترك بك في أي شيء.' : 'Paying never enrols you in anything.'}</li>
          <li>{ar ? 'كل دفعة تنتهي بنتيجة واضحة ولا تُخصم مرتين.' : 'Every payment ends clearly and never charges twice.'}</li>
          <li>{ar ? 'ترى أين يمكنك استخدام الكاش باك قبل أن تعتمد عليه.' : 'You see where cashback works before you rely on it.'}</li>
        </ol>
      </div>
      <div className="grid2">
        <Link className="btn secondary" href="/cashback">{ar ? 'الكاش باك' : 'Cashback'}</Link>
        <Link className="btn secondary" href="/staff-card">{ar ? 'بطاقة الموظفين' : 'Staff card'}</Link>
        <Link className="btn secondary" href={info ? `/merchant?branch=${info.branchId}` : '/merchant'}>{ar ? 'شاشة المطعم' : 'Restaurant view'}</Link>
        <Link className="btn secondary" href="/demo">{ar ? 'أدوات العرض' : 'Demo controls'}</Link>
      </div>
    </>
  );
}
