import { PrismaClient } from '@prisma/client';
import { MockGateway } from '@qlub-pay/core';
import { BillService } from './services/bills';
import { CashbackService } from './services/cashback';
import { InvoiceService } from './services/invoices';
import { MembershipService } from './services/memberships';
import { MerchantService } from './services/merchant';
import { PaymentService } from './services/payments';

/** Plain composition root, shared by the Nest app and the tests. */
export function createContainer(db = new PrismaClient(), now: () => Date = () => new Date()) {
  const gateway = new MockGateway();
  const invoices = new InvoiceService(db);
  const cashback = new CashbackService(db, now);
  return {
    db,
    gateway,
    invoices,
    cashback,
    bills: new BillService(db),
    payments: new PaymentService(db, gateway, invoices, cashback, now),
    memberships: new MembershipService(db, now),
    merchant: new MerchantService(db),
  };
}

export type Container = ReturnType<typeof createContainer>;
