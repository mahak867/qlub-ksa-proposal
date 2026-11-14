# Clear pay-at-table for KSA: a one-page brief

> Independent concept by Mahak Fahad. Not affiliated with Qlub. Built from public information only.
> Demo: `[DEMO_URL]` · 90-second video: `[VIDEO_URL]` · Code: github.com/mahak867/qlub-pay

## The observation

Qlub's QR pay-at-table is fast and needs no app. Diners who like it say so. The frustration in public reviews is mostly about what surrounds the payment.

I read and coded **101 one- and two-star reviews** of the Qlub+ app from the Saudi storefronts of Google Play (94) and the App Store (7), dated May 2025 to November 2026:

| What reviewers report | Reviews | Share |
|---|---|---|
| Cashback or points can't be used, or the balance disappears | 26 | 26% |
| App crashes or won't open (mostly after a September 2025 update) | 24 | 24% |
| A subscription they say they didn't knowingly agree to, or can't cancel | 20 | 20% |
| Confusion between paying the bill and the rewards app; staff unsure | 7 | 7% |
| Tip pre-selected, or tip and fees shown only at the payment step | 6 | 6% |
| Payment slow, failed, or debited without completing | 4 | 4% |

Limits of this evidence: reviews over-represent unhappy users; at least 9 of these reviewers appear to be in the UAE; and I can't see how common each issue is across all diners. Full method and paraphrased examples: [evidence.md](evidence.md).

## The idea

Four promises to the diner, each enforced by the system so it can't be broken by accident:

1. **The amount you review is the amount you're charged.** The full total sits above the pay button. The server rejects any charge that differs from what the screen showed.
2. **Paying never enrols you in anything.** The payment request has no membership field. The Qlub+ offer appears after payment, unticked, with the price, renewal and cancellation in one plain sentence, and a stored record of what the diner agreed to. Cancel is one tap.
3. **Every payment finishes, and never charges twice.** Each payment reaches Paid or Not charged within 90 seconds. Retrying is always safe. If a bank confirms late and the share was already paid, the refund is automatic.
4. **You can see where your cashback works.** One per-branch setting drives both a "where can I use it" page and the checkout, so the app never promises a balance the branch won't accept.

Also included: split bills that map to one tax invoice with a ZATCA QR code, an Arabic-first interface, a printable bilingual card that explains paying and rewards to staff and guests, and a restaurant view with reconciliation and a POS menu-sync check.

## What exists today

A working prototype in TypeScript (Next.js, NestJS, Postgres) with 39 automated tests, including tests for double charges, hung payments and late bank confirmations. The payment gateway, ZATCA signing and POS feed are mocks and are labelled as such. Design: [SPEC.md](SPEC.md).

It was built in days using AI coding agents, with me directing, reviewing and testing. The build log shows which agent did what: [BUILD_LOG.md](BUILD_LOG.md).

## The trade-off I expect you to raise

The prototype starts the tip at zero. Qlub's tipping prompts raise staff income, and restaurants value that. I'm not claiming zero is right. I'm suggesting it is worth testing a prompt with **suggested amounts and none pre-selected**, and measuring what happens to both tips and complaints.

## How I would measure a pilot

| Measure | Expectation |
|---|---|
| Checkout completion (bill viewed to paid) | Up |
| Share of payments with a tip, and average tip | The number to watch; may fall |
| Payments reaching a final state in 90 seconds; duplicate charges | 100%; zero |
| Support contacts per 1,000 payments about fees, tips or subscriptions | Down |
| Membership opt-in after payment, and cancellations in the first 30 days | Fewer joins, far fewer cancellations and refund requests |
| Cashback redemption among members with a balance | Up |

## What I'm asking for

Fifteen minutes of feedback from someone who knows the KSA product: what I've misunderstood, and what you've already solved. If any part is useful, I'd be glad to help build or test it.

## What I have not verified

Current Qlub+ price and trial terms in KSA; whether the current KSA checkout still pre-selects a tip (the reports date from 2023 to 2025); how voluntary tips are treated for VAT; and whether the 2012 Ministry of Commerce rule on service charges is still enforced. The membership price in the demo is a placeholder.

**Mahak Fahad** · `[EMAIL]` · `[LINKEDIN_URL]` · Previously shipped: HotScan (hotscan.in), with live Razorpay payments; a PayPal hackathon build.
