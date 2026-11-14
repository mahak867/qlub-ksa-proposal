import { PrismaClient } from '@prisma/client';

export const DEMO_TABLE_TOKEN = 'demo-t12-7Hq3xP';
export const DEMO_PHONE = '+966500000001';

/** Neutral demo data. No real restaurant, no Qlub branding. VAT number is a demo value. */
export async function seed(db: PrismaClient): Promise<{ branchId: string; token: string }> {
  await db.$transaction([
    db.event.deleteMany(),
    db.notification.deleteMany(),
    db.consentRecord.deleteMany(),
    db.membership.deleteMany(),
    db.cashbackEntry.deleteMany(),
    db.idempotencyRecord.deleteMany(),
    db.invoice.deleteMany(),
    db.payment.deleteMany(),
    db.share.deleteMany(),
    db.billItem.deleteMany(),
    db.bill.deleteMany(),
    db.table.deleteMany(),
    db.menuItem.deleteMany(),
    db.branch.deleteMany(),
    db.restaurant.deleteMany(),
  ]);

  const r = await db.restaurant.create({ data: { nameAr: 'بيت السفرة', nameEn: 'Sufra House (demo)', vatNumber: '310000000000003' } });
  const riyadh = await db.branch.create({ data: { restaurantId: r.id, nameAr: 'فرع العليا', nameEn: 'Olaya branch', city: 'Riyadh', earnsCashback: true, acceptsCashback: true } });
  const jeddah = await db.branch.create({ data: { restaurantId: r.id, nameAr: 'فرع التحلية', nameEn: 'Tahlia branch', city: 'Jeddah', earnsCashback: true, acceptsCashback: false } });
  await db.branch.create({ data: { restaurantId: r.id, nameAr: 'فرع الخبر', nameEn: 'Khobar branch', city: 'Eastern Province', earnsCashback: true, acceptsCashback: true } });

  const menu = [
    { posCode: 'POS-001', nameAr: 'كبسة لحم', nameEn: 'Lamb kabsa', unitPrice: 7500 },
    { posCode: 'POS-002', nameAr: 'مشاوي مشكلة', nameEn: 'Mixed grill', unitPrice: 9500 },
    { posCode: 'POS-003', nameAr: 'حمص', nameEn: 'Hummus', unitPrice: 1800 },
    { posCode: 'POS-004', nameAr: 'ليمون بالنعناع', nameEn: 'Lemon mint', unitPrice: 1600 },
  ];
  await db.menuItem.createMany({ data: menu.map((m) => ({ ...m, branchId: riyadh.id })) });

  const t12 = await db.table.create({ data: { branchId: riyadh.id, label: '12', token: DEMO_TABLE_TOKEN, posTableCode: 'T12' } });
  await db.table.create({ data: { branchId: riyadh.id, label: '14', token: 'demo-t14-Lm9wZq' } }); // unmapped on purpose
  await db.table.create({ data: { branchId: jeddah.id, label: '3', token: 'demo-j3-Rt5vKa', posTableCode: 'T3' } });

  await newBill(db, t12.id);

  await db.cashbackEntry.create({ data: { phone: DEMO_PHONE, branchId: jeddah.id, type: 'EARN', amount: 2500, expiresAt: new Date(Date.now() + 9 * 86400_000) } });
  return { branchId: riyadh.id, token: DEMO_TABLE_TOKEN };
}

export async function newBill(db: PrismaClient, tableId: string) {
  const items = [
    { nameAr: 'كبسة لحم', nameEn: 'Lamb kabsa', quantity: 1, unitPrice: 7500 },
    { nameAr: 'مشاوي مشكلة', nameEn: 'Mixed grill', quantity: 1, unitPrice: 9500 },
    { nameAr: 'حمص', nameEn: 'Hummus', quantity: 1, unitPrice: 1800 },
    { nameAr: 'ليمون بالنعناع', nameEn: 'Lemon mint', quantity: 2, unitPrice: 1600 },
  ];
  const total = items.reduce((a, i) => a + i.quantity * i.unitPrice, 0);
  return db.bill.create({ data: { tableId, total, items: { create: items } } });
}
