'use client';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';

export type Locale = 'ar' | 'en';

const dict = {
  noAppNeeded: { ar: 'لا حاجة لأي تطبيق. ادفع هنا من المتصفح.', en: 'No app needed. Pay here in your browser.' },
  table: { ar: 'طاولة', en: 'Table' },
  total: { ar: 'الإجمالي', en: 'Total' },
  vatIncluded: { ar: 'شامل ضريبة القيمة المضافة 15%', en: 'Includes 15% VAT' },
  alreadyPaid: { ar: 'مدفوع مسبقًا', en: 'Already paid' },
  inProgress: { ar: 'قيد الدفع', en: 'Being paid' },
  leftToPay: { ar: 'المتبقي', en: 'Left to pay' },
  payBill: { ar: 'ادفع الفاتورة', en: 'Pay the bill' },
  billPaid: { ar: 'تم دفع الفاتورة بالكامل', en: 'This bill is fully paid' },
  howToPay: { ar: 'كيف تريد الدفع؟', en: 'How do you want to pay?' },
  payRest: { ar: 'ادفع المتبقي', en: 'Pay what is left' },
  byItem: { ar: 'حسب الأصناف', en: 'By item' },
  equal: { ar: 'بالتساوي', en: 'Split equally' },
  custom: { ar: 'مبلغ محدد', en: 'Custom amount' },
  people: { ar: 'عدد الأشخاص', en: 'Number of people' },
  yourShare: { ar: 'حصتك', en: 'Your share' },
  continue: { ar: 'متابعة', en: 'Continue' },
  back: { ar: 'رجوع', en: 'Back' },
  review: { ar: 'راجع المبلغ قبل الدفع', en: 'Review before you pay' },
  tip: { ar: 'إكرامية للموظفين (اختيارية)', en: 'Tip for the staff (optional)' },
  noTip: { ar: 'بدون إكرامية', en: 'No tip' },
  otherAmount: { ar: 'مبلغ آخر', en: 'Other amount' },
  tipNote: { ar: 'الإكرامية تذهب للموظفين وليست جزءًا من الفاتورة الضريبية.', en: 'Tips go to the staff and are not part of the tax invoice.' },
  useCashback: { ar: 'استخدم رصيد الكاش باك', en: 'Use my cashback' },
  cashbackNotHere: { ar: 'هذا الفرع لا يقبل الدفع بالكاش باك.', en: 'This branch does not accept cashback.' },
  phoneForCashback: { ar: 'رقم الجوال (لاستخدام الكاش باك فقط)', en: 'Mobile number (only to use cashback)' },
  balance: { ar: 'الرصيد', en: 'Balance' },
  youPay: { ar: 'ستدفع', en: 'You pay' },
  noOtherFees: { ar: 'لا رسوم إضافية. هذا هو المبلغ الذي سيُخصم بالضبط.', en: 'No other fees. This is exactly what you will be charged.' },
  payMada: { ar: 'ادفع بمدى', en: 'Pay with mada' },
  payApple: { ar: 'ادفع بـ Apple Pay', en: 'Pay with Apple Pay' },
  demoPayment: { ar: 'دفع تجريبي — لا تُستخدم بطاقة حقيقية', en: 'Demo payment — no real card is used' },
  totalChanged: { ar: 'تغيّر المبلغ. راجع الإجمالي الجديد ثم ادفع.', en: 'The total changed. Check the new total, then pay.' },
  statusPaid: { ar: 'تم الدفع', en: 'Paid' },
  statusChecking: { ar: 'جارٍ التحقق مع البنك', en: 'Checking with your bank' },
  statusCheckingNote: { ar: 'لا تحتاج لفعل أي شيء. سنعرض النتيجة خلال', en: 'Nothing to do. You will see the result within' },
  seconds: { ar: 'ثانية', en: 'seconds' },
  statusNotCharged: { ar: 'لم يتم خصم أي مبلغ', en: 'You were not charged' },
  statusNotChargedNote: { ar: 'يمكنك المحاولة مرة أخرى الآن.', en: 'You can try again right now.' },
  statusRefund: { ar: 'المبلغ في طريقه إليك', en: 'Refund on its way' },
  statusRefundNote: { ar: 'تم الدفع لهذه الحصة من شخص آخر، لذلك سنعيد المبلغ تلقائيًا.', en: 'Someone else paid this share first, so we refund you automatically.' },
  statusRefunded: { ar: 'تم استرداد المبلغ', en: 'Refunded' },
  tryAgain: { ar: 'حاول مرة أخرى', en: 'Try again' },
  viewReceipt: { ar: 'عرض الإيصال', en: 'View receipt' },
  receipt: { ar: 'إيصال الدفع', en: 'Payment receipt' },
  receiptNote: { ar: 'هذا إيصال دفعتك، وليس فاتورة ضريبية.', en: 'This is a receipt for your payment, not a tax invoice.' },
  reference: { ar: 'المرجع', en: 'Reference' },
  share: { ar: 'الحصة', en: 'Share' },
  cashbackUsed: { ar: 'كاش باك مستخدم', en: 'Cashback used' },
  charged: { ar: 'المبلغ المخصوم', en: 'Charged' },
  taxInvoice: { ar: 'الفاتورة الضريبية المبسطة', en: 'Simplified tax invoice' },
  invoicePending: { ar: 'تصدر الفاتورة الضريبية عند دفع الفاتورة كاملة.', en: 'The tax invoice is issued once the whole bill is paid.' },
  invoiceNo: { ar: 'رقم الفاتورة', en: 'Invoice number' },
  vat: { ar: 'ضريبة القيمة المضافة', en: 'VAT' },
  mockQr: { ar: 'الحقول 1–5 حقيقية. الحقول 6–9 تجريبية وليست ختمًا صالحًا من هيئة الزكاة.', en: 'QR tags 1–5 are real. Tags 6–9 are mock values, not a valid ZATCA stamp.' },
  offerTitle: { ar: 'اختياري: احصل على مكافآت في زيارتك القادمة', en: 'Optional: earn rewards next time' },
  offerSub: { ar: 'تم الدفع ولن يتغير شيء إذا تجاهلت هذا.', en: 'You have paid. Nothing changes if you skip this.' },
  noThanks: { ar: 'لا، شكرًا', en: 'No thanks' },
  join: { ar: 'انضم', en: 'Join' },
  agree: { ar: 'قرأت الشروط أعلاه وأوافق عليها', en: 'I have read the terms above and agree' },
  phone: { ar: 'رقم الجوال', en: 'Mobile number' },
  otp: { ar: 'رمز التحقق', en: 'Verification code' },
  membership: { ar: 'العضوية', en: 'Membership' },
  active: { ar: 'نشطة', en: 'Active' },
  cancelled: { ar: 'ملغاة', en: 'Cancelled' },
  trialEnds: { ar: 'تنتهي الفترة المجانية', en: 'Free trial ends' },
  nextCharge: { ar: 'الخصم القادم', en: 'Next charge' },
  cancelOneTap: { ar: 'إلغاء العضوية الآن', en: 'Cancel membership now' },
  cancelledNote: { ar: 'تم الإلغاء فورًا. لن يتم خصم أي مبلغ.', en: 'Cancelled immediately. You will not be charged.' },
  consentRecord: { ar: 'ما وافقت عليه', en: 'What you agreed to' },
  whereCashback: { ar: 'أين أستخدم الكاش باك؟', en: 'Where can I use my cashback?' },
  acceptsHere: { ar: 'يقبل الدفع بالكاش باك', en: 'Accept cashback' },
  earnOnly: { ar: 'تكسب فيها فقط (لا تقبل الدفع بالكاش باك)', en: 'Earn only (cannot spend here)' },
  allCities: { ar: 'كل المدن', en: 'All cities' },
  expiresSoonest: { ar: 'أقرب انتهاء صلاحية', en: 'Soonest expiry' },
  check: { ar: 'عرض', en: 'Show' },
  footer: { ar: 'مفهوم غير رسمي — غير تابع لـ Qlub.', en: 'Unofficial concept — not affiliated with Qlub.' },
  language: { ar: 'English', en: 'العربية' },
} satisfies Record<string, Record<Locale, string>>;

export type Key = keyof typeof dict;

const Ctx = createContext<{ locale: Locale; setLocale: (l: Locale) => void; t: (k: Key) => string }>({
  locale: 'ar',
  setLocale: () => {},
  t: (k) => dict[k].ar,
});

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>('ar');
  useEffect(() => {
    try {
      const saved = localStorage.getItem('locale');
      if (saved === 'en' || saved === 'ar') setLocaleState(saved);
    } catch {}
  }, []);
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
  }, [locale]);
  const setLocale = (l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem('locale', l);
    } catch {}
  };
  return <Ctx.Provider value={{ locale, setLocale, t: (k) => dict[k][locale] }}>{children}</Ctx.Provider>;
}

export const useI18n = () => useContext(Ctx);

export function sar(amount: number, locale: Locale): string {
  const v = (amount / 100).toFixed(2);
  return locale === 'ar' ? `${v} ر.س` : `SAR ${v}`;
}
