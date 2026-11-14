import { PrismaClient } from '@prisma/client';
import { ApiError } from '../errors';

/** PLACEHOLDER terms: the real Qlub+ price and trial in KSA are unverified. */
export const MEMBERSHIP_TERMS = {
  version: '2026-11-concept-1',
  monthlyPrice: 1500, // SAR 15.00, placeholder
  trialDays: 30, // placeholder
  reminderDaysBefore: 3,
};

export function consentText(locale: 'ar' | 'en'): string {
  const t = MEMBERSHIP_TERMS;
  const price = (t.monthlyPrice / 100).toFixed(2);
  return locale === 'ar'
    ? `عضوية اختيارية. مجانية لمدة ${t.trialDays} يومًا، ثم ${price} ريال شهريًا وتتجدد تلقائيًا. سنذكّرك قبل أي خصم بـ ${t.reminderDaysBefore} أيام. يمكنك الإلغاء بنقرة واحدة في أي وقت دون رسوم.`
    : `Optional membership. Free for ${t.trialDays} days, then SAR ${price} per month, renewing automatically. We remind you ${t.reminderDaysBefore} days before any charge. Cancel in one tap at any time, free.`;
}

/** Mock OTP for the demo. */
export const DEMO_OTP = '123456';

export interface JoinInput {
  phone: string;
  otp: string;
  consent: boolean;
  textVersion: string;
  locale: 'ar' | 'en';
  paymentId?: string;
}

export class MembershipService {
  constructor(private readonly db: PrismaClient, private readonly now: () => Date = () => new Date()) {}

  terms(locale: 'ar' | 'en') {
    return { ...MEMBERSHIP_TERMS, text: consentText(locale) };
  }

  /** The ONLY way to create a membership. Paying never calls this. */
  async join(input: JoinInput) {
    if (input.consent !== true) throw new ApiError('CONSENT_REQUIRED', 'membership needs an explicit yes');
    if (input.textVersion !== MEMBERSHIP_TERMS.version) throw new ApiError('CONSENT_REQUIRED', 'the terms changed; please read them again');
    if (input.otp !== DEMO_OTP) throw new ApiError('VALIDATION', 'wrong verification code');
    const now = this.now();
    const trialEndsAt = new Date(now.getTime() + MEMBERSHIP_TERMS.trialDays * 86400_000);
    return this.db.$transaction(async (tx) => {
      const m = await tx.membership.create({
        data: { phone: input.phone, monthlyPrice: MEMBERSHIP_TERMS.monthlyPrice, trialEndsAt, nextChargeAt: trialEndsAt, startedAt: now },
      });
      await tx.consentRecord.create({
        data: { membershipId: m.id, paymentId: input.paymentId, textVersion: MEMBERSHIP_TERMS.version, textShown: consentText(input.locale), locale: input.locale, acceptedAt: now },
      });
      await tx.notification.create({
        data: {
          phone: input.phone,
          kind: 'trial_ending',
          body: input.locale === 'ar' ? 'تنتهي فترتك المجانية بعد 3 أيام. للإلغاء: رابط بنقرة واحدة.' : 'Your free trial ends in 3 days. Cancel in one tap: link.',
          sendAt: new Date(trialEndsAt.getTime() - MEMBERSHIP_TERMS.reminderDaysBefore * 86400_000),
        },
      });
      await tx.event.create({ data: { name: 'membership_joined', paymentId: input.paymentId } });
      return this.view(m.id, tx as unknown as PrismaClient);
    });
  }

  /** One tap, immediate, free. Idempotent. */
  async cancel(id: string) {
    const m = await this.db.membership.findUnique({ where: { id } });
    if (!m) throw new ApiError('NOT_FOUND', 'membership not found');
    if (m.status === 'ACTIVE') {
      await this.db.membership.update({ where: { id }, data: { status: 'CANCELLED', cancelledAt: this.now() } });
      await this.db.notification.deleteMany({ where: { phone: m.phone, sentAt: null, kind: 'trial_ending' } });
      await this.db.event.create({ data: { name: 'membership_cancelled' } });
    }
    return this.view(id);
  }

  async view(id: string, db: PrismaClient = this.db) {
    const m = await db.membership.findUnique({ where: { id }, include: { consent: true } });
    if (!m) throw new ApiError('NOT_FOUND', 'membership not found');
    return {
      id: m.id,
      status: m.status,
      monthlyPrice: m.monthlyPrice,
      trialEndsAt: m.trialEndsAt.toISOString(),
      nextChargeAt: m.status === 'ACTIVE' ? m.nextChargeAt.toISOString() : null,
      cancelledAt: m.cancelledAt?.toISOString() ?? null,
      consent: m.consent && { version: m.consent.textVersion, text: m.consent.textShown, locale: m.consent.locale, acceptedAt: m.consent.acceptedAt.toISOString() },
    };
  }
}
