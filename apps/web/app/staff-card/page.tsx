'use client';

/** Printable A5 card for tables and staff. Always bilingual, regardless of the toggle. */
export default function StaffCard() {
  const sections = [
    {
      ar: ['الدفع', 'امسح الرمز على الطاولة. يفتح المتصفح مباشرة. لا تحتاج لأي تطبيق أو تسجيل.'],
      en: ['Paying', 'Scan the code on the table. It opens in the browser. No app or sign-up needed.'],
    },
    {
      ar: ['تقسيم الفاتورة', 'كل شخص يختار أصنافه أو حصة متساوية أو مبلغًا محددًا ويدفع بنفسه.'],
      en: ['Splitting', 'Each person picks their items, an equal share or an amount, and pays for themselves.'],
    },
    {
      ar: ['الإكرامية', 'اختيارية تمامًا، ولا يوجد مبلغ محدد مسبقًا. يظهر الإجمالي النهائي قبل زر الدفع.'],
      en: ['Tipping', 'Fully optional, nothing is pre-selected. The final total is shown before the pay button.'],
    },
    {
      ar: ['تطبيق المكافآت', 'منفصل واختياري. لا يلزم للدفع، والدفع لا يشترك بأحد في أي عضوية.'],
      en: ['The rewards app', 'Separate and optional. Not needed to pay, and paying never signs anyone up.'],
    },
    {
      ar: ['إذا ظهر "جارٍ التحقق"', 'لا تطلب الدفع مرة أخرى. خلال 90 ثانية يظهر "تم الدفع" أو "لم يتم الخصم".'],
      en: ['If it says "Checking"', 'Don’t ask the guest to pay again. Within 90 seconds it shows Paid or Not charged.'],
    },
    {
      ar: ['يفضّل الضيف جهاز البطاقة؟', 'أحضره له. الرمز خيار وليس إلزامًا.'],
      en: ['Guest prefers the card machine?', 'Bring it. The QR code is an option, not a requirement.'],
    },
  ];
  return (
    <>
      <p className="noprint">
        <button className="btn secondary" onClick={() => window.print()}>
          Print / طباعة
        </button>
      </p>
      <div className="card" style={{ maxWidth: 520, margin: '0 auto' }}>
        <h1 dir="rtl" style={{ textAlign: 'center' }}>
          كيف تدفع هنا
        </h1>
        <h2 dir="ltr" style={{ textAlign: 'center', marginTop: 0 }}>
          How paying works here
        </h2>
        {sections.map((s, i) => (
          <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, borderTop: '1px solid var(--line)', padding: '10px 0' }}>
            <div dir="ltr" lang="en">
              <strong>{s.en[0]}</strong>
              <p style={{ fontSize: 14 }}>{s.en[1]}</p>
            </div>
            <div dir="rtl" lang="ar">
              <strong>{s.ar[0]}</strong>
              <p style={{ fontSize: 14 }}>{s.ar[1]}</p>
            </div>
          </div>
        ))}
        <p className="muted" style={{ textAlign: 'center', fontSize: 12 }}>
          Unofficial concept — not affiliated with Qlub. · مفهوم غير رسمي — غير تابع لـ Qlub.
        </p>
      </div>
    </>
  );
}
