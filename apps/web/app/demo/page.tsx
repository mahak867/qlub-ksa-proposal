'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ErrorNote } from '../shell';

type Mode = 'APPROVE' | 'DECLINE' | 'HANG' | 'LATE_SUCCESS';

export default function Demo() {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const [info, setInfo] = useState<{ token: string; branchId: string; gatewayMode: Mode; phone: string; otp: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [paymentId, setPaymentId] = useState('');

  const load = () => api<typeof info>('/demo/info').then(setInfo).catch((e) => setErr(e.message));
  useEffect(() => {
    load();
  }, []);

  async function run(fn: () => Promise<unknown>, done: string) {
    setErr(null);
    try {
      const r = await fn();
      setMsg(`${done} ${JSON.stringify(r)}`);
      load();
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const modes: { m: Mode; ar: string; en: string }[] = [
    { m: 'APPROVE', ar: 'موافقة فورية', en: 'Approve' },
    { m: 'DECLINE', ar: 'رفض', en: 'Decline' },
    { m: 'HANG', ar: 'لا رد (عالق)', en: 'Hang (no answer)' },
    { m: 'LATE_SUCCESS', ar: 'نجاح متأخر', en: 'Late success' },
  ];

  return (
    <>
      <h1>{ar ? 'أدوات العرض' : 'Demo controls'}</h1>
      <p className="muted">{ar ? 'تحكم في نتيجة الدفعة التالية لعرض سلوك الاسترداد.' : 'Choose what the next payment does, to show recovery live.'}</p>
      <div className="card">
        <strong>{ar ? 'بوابة الدفع التجريبية' : 'Mock gateway'}</strong>
        <div className="chips" style={{ marginTop: 8 }}>
          {modes.map((x) => (
            <button key={x.m} className="chip" aria-pressed={info?.gatewayMode === x.m} onClick={() => run(() => api('/demo/gateway-mode', { method: 'POST', json: { mode: x.m } }), 'mode:')}>
              {ar ? x.ar : x.en}
            </button>
          ))}
        </div>
      </div>
      <div className="card">
        <button className="btn secondary" onClick={() => run(() => api('/demo/recover-now', { method: 'POST' }), ar ? 'تم تشغيل الاسترداد:' : 'Recovery ran:')}>
          {ar ? 'شغّل مهمة الاسترداد الآن (تخطَّ مهلة 90 ثانية)' : 'Run recovery now (skip the 90s wait)'}
        </button>
        <label className="field">
          <span>{ar ? 'معرّف الدفعة (من رابط صفحة الحالة)' : 'Payment id (from the status page URL)'}</span>
          <input type="text" dir="ltr" value={paymentId} onChange={(e) => setPaymentId(e.target.value)} />
        </label>
        <button className="btn secondary" disabled={!paymentId} onClick={() => run(() => api(`/demo/payments/${paymentId}/settle-late`, { method: 'POST' }), ar ? 'تأكيد متأخر من البنك:' : 'Bank confirmed late:')}>
          {ar ? 'البنك يؤكد الآن (نجاح متأخر)' : 'Bank confirms now (late success)'}
        </button>
      </div>
      <div className="card">
        <button className="btn secondary" onClick={() => run(() => api('/demo/reset', { method: 'POST' }), ar ? 'تمت إعادة الضبط:' : 'Reset:')}>
          {ar ? 'إعادة ضبط البيانات التجريبية' : 'Reset demo data'}
        </button>
        {info && (
          <p className="muted">
            {ar ? 'جوال تجريبي' : 'Demo phone'}: <bdi dir="ltr">{info.phone}</bdi> · OTP <bdi dir="ltr">{info.otp}</bdi>
          </p>
        )}
      </div>
      <ErrorNote message={err} />
      {msg && <pre style={{ whiteSpace: 'pre-wrap', fontSize: 12 }}>{msg}</pre>}
      {info && (
        <div className="grid2">
          <Link className="btn" href={`/t/${info.token}`}>
            {ar ? 'طاولة 12' : 'Table 12'}
          </Link>
          <Link className="btn secondary" href={`/merchant?branch=${info.branchId}`}>
            {ar ? 'شاشة المطعم' : 'Restaurant view'}
          </Link>
        </div>
      )}
    </>
  );
}
