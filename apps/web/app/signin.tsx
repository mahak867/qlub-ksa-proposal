'use client';
import { useState } from 'react';
import { api, ApiFailure, errorText, getSessionPhone, setToken } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ErrorNote } from './shell';

/** Phone + one-time code. Calls onDone with the verified phone. */
export function SignIn({ onDone, why }: { onDone: (phone: string) => void; why?: string }) {
  const { locale } = useI18n();
  const ar = locale === 'ar';
  const [phone, setPhone] = useState('+9665');
  const [code, setCode] = useState('');
  const [step, setStep] = useState<'phone' | 'code'>('phone');
  const [hint, setHint] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function send() {
    setErr(null);
    setBusy(true);
    try {
      const r = await api<{ demoHint?: string }>('/auth/otp/request', { method: 'POST', json: { phone } });
      setHint(r.demoHint ?? null);
      setStep('code');
    } catch (e) {
      setErr(e instanceof ApiFailure ? errorText(e.code, locale, e.message) : String(e));
    }
    setBusy(false);
  }
  async function verify() {
    setErr(null);
    setBusy(true);
    try {
      const r = await api<{ token: string; expiresAt: string; phone: string }>('/auth/otp/verify', { method: 'POST', json: { phone, otp: code } });
      setToken('diner', r);
      onDone(r.phone);
    } catch (e) {
      setErr(e instanceof ApiFailure ? (ar ? 'رمز غير صحيح.' : 'Wrong code.') : String(e));
    }
    setBusy(false);
  }

  return (
    <div>
      {why && <p className="muted">{why}</p>}
      {step === 'phone' ? (
        <>
          <label className="field">
            <span>{ar ? 'رقم الجوال' : 'Mobile number'}</span>
            <input type="tel" dir="ltr" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value.trim())} />
          </label>
          <button className="btn secondary" disabled={busy || !/^\+9665\d{8}$/.test(phone)} onClick={send}>
            {ar ? 'أرسل رمز التحقق' : 'Send code'}
          </button>
        </>
      ) : (
        <>
          <label className="field">
            <span>{ar ? 'رمز التحقق' : 'Verification code'}</span>
            <input type="text" inputMode="numeric" autoComplete="one-time-code" dir="ltr" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          </label>
          {hint && <p className="muted">{hint}</p>}
          <button className="btn secondary" disabled={busy || code.length !== 6} onClick={verify}>
            {ar ? 'تحقق' : 'Verify'}
          </button>
        </>
      )}
      <ErrorNote message={err} />
    </div>
  );
}

export function SignedInAs({ onSignOut }: { onSignOut: () => void }) {
  const { locale } = useI18n();
  const phone = getSessionPhone();
  return (
    <p className="muted">
      {locale === 'ar' ? 'مسجّل بالرقم' : 'Signed in as'} <bdi dir="ltr">{phone}</bdi> ·{' '}
      <button
        className="lang"
        style={{ minHeight: 32, padding: '2px 10px' }}
        onClick={() => {
          setToken('diner', null);
          onSignOut();
        }}
      >
        {locale === 'ar' ? 'خروج' : 'Sign out'}
      </button>
    </p>
  );
}
