'use client';
import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import { ErrorNote, Money } from '../shell';

interface BranchRow {
  id: string;
  city: string;
  nameAr: string;
  nameEn: string;
  restaurantAr: string;
  restaurantEn: string;
}
interface Branches {
  accepts: BranchRow[];
  earnOnly: BranchRow[];
  cities: string[];
}
interface Wallet {
  balance: number;
  soonestExpiry: string | null;
}

const CITY_AR: Record<string, string> = { Riyadh: 'الرياض', Jeddah: 'جدة', 'Eastern Province': 'المنطقة الشرقية' };

export default function CashbackPage() {
  const { t, locale } = useI18n();
  const [city, setCity] = useState('');
  const [data, setData] = useState<Branches | null>(null);
  const [phone, setPhone] = useState('+966500000001');
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cityName = (c: string) => (locale === 'ar' ? CITY_AR[c] ?? c : c);

  useEffect(() => {
    api<Branches>(`/cashback/branches${city ? `?city=${encodeURIComponent(city)}` : ''}`).then(setData).catch((e) => setErr(e.message));
  }, [city]);

  async function look() {
    setErr(null);
    try {
      setWallet(await api<Wallet>(`/cashback?phone=${encodeURIComponent(phone)}`));
    } catch (e) {
      setErr((e as Error).message);
    }
  }

  const row = (b: BranchRow) => (
    <div className="row" key={b.id}>
      <span>
        {locale === 'ar' ? b.restaurantAr : b.restaurantEn} — {locale === 'ar' ? b.nameAr : b.nameEn}
      </span>
      <span className="muted">{cityName(b.city)}</span>
    </div>
  );

  return (
    <>
      <h1>{t('whereCashback')}</h1>
      <div className="card">
        <label className="field">
          <span>{t('phone')}</span>
          <input type="tel" dir="ltr" value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <button className="btn secondary" onClick={look}>
          {t('check')}
        </button>
        {wallet && (
          <>
            <div className="row total">
              <span>{t('balance')}</span>
              <Money value={wallet.balance} />
            </div>
            {wallet.soonestExpiry && (
              <div className="banner warn">
                {t('expiresSoonest')}: {new Date(wallet.soonestExpiry).toLocaleDateString(locale === 'ar' ? 'ar-SA-u-ca-gregory' : 'en-GB')}
              </div>
            )}
          </>
        )}
      </div>
      <ErrorNote message={err} />
      <div className="chips" role="group">
        <button className="chip" aria-pressed={city === ''} onClick={() => setCity('')}>
          {t('allCities')}
        </button>
        {data?.cities.map((c) => (
          <button key={c} className="chip" aria-pressed={city === c} onClick={() => setCity(c)}>
            {cityName(c)}
          </button>
        ))}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>
          <span className="pill good">✓</span> {t('acceptsHere')}
        </h2>
        {data?.accepts.length ? data.accepts.map(row) : <p className="muted">—</p>}
      </div>
      <div className="card">
        <h2 style={{ marginTop: 0 }}>
          <span className="pill warn">!</span> {t('earnOnly')}
        </h2>
        {data?.earnOnly.length ? data.earnOnly.map(row) : <p className="muted">—</p>}
      </div>
    </>
  );
}
