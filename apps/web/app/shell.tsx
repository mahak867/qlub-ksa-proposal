'use client';
import Link from 'next/link';
import { ReactNode } from 'react';
import { useI18n } from '@/lib/i18n';

export function Shell({ children }: { children: ReactNode }) {
  const { t, locale, setLocale } = useI18n();
  return (
    <div className="shell">
      <header className="top">
        <Link href="/" className="brand" aria-label="Home">
          <span className="dot" aria-hidden /> {locale === 'ar' ? 'الدفع على الطاولة' : 'Pay at table'}
        </Link>
        <button className="lang" onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}>
          {t('language')}
        </button>
      </header>
      <main className="main">{children}</main>
      <footer className="foot">{t('footer')}</footer>
    </div>
  );
}

export function Money({ value, big }: { value: number; big?: boolean }) {
  const { locale } = useI18n();
  const v = (value / 100).toFixed(2);
  return (
    <span className={big ? 'money big' : 'money'}>
      {locale === 'ar' ? (
        <>
          <bdi>{v}</bdi> <small>ر.س</small>
        </>
      ) : (
        <>
          <small>SAR</small> <bdi>{v}</bdi>
        </>
      )}
    </span>
  );
}

export function ErrorNote({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <p className="error" role="alert">
      {message}
    </p>
  );
}
