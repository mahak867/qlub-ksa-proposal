# Evidence: what diners report about Qlub+ (KSA storefronts)

> Unofficial, independent research. Not affiliated with Qlub. Everything below is **reported by users**, not proven. Quotes are paraphrased or shortened, and reviewer names are removed.

## Method

| Source | What was collected | Date range |
|---|---|---|
| Google Play, `org.qlub.plus`, country=SA, English + Arabic, newest first | 193 unique reviews, of which **94 are 1–2★** | 2025-05-04 → 2026-11-11 |
| Saudi App Store, `id6736754041`, the reviews embedded in the public page (EN + AR) | 10 reviews, of which **7 are 1★** | 2025-11 → 2026-06 |
| Earlier desk research (Reddit r/dubai, Qlub's site and privacy notice, Google Play data-safety section) | Context only, not counted | 2023 → 2026 |

- **Total coded:** 101 low-star reviews. A review can carry more than one theme.
- **Rating mix on Google Play (193 reviews):** 90×1★, 4×2★, 6×3★, 9×4★, 85×5★. The ratings are polarised. Many 5★ reviews praise fast payment and splitting the bill.
- **Caveats:**
  - A "country=SA" storefront does **not** guarantee Saudi users. 9 of the low-star reviews mention AED, a UAE signal. 3 mention Saudi places or riyals (Riyadh, Jeddah, the Eastern Province, ريال).
  - These reviews were collected on 14 Nov 2026 and are a snapshot, not a random sample.
  - App-store reviews skew towards angry users.

## Theme counts (101 low-star reviews)

| # | Theme | Count | Share | Notes |
|---|---|---|---|---|
| 1 | **Cashback, points or wallet balance can't be used, or disappears** | 26 | 26% | The largest theme, and the heaviest in Arabic reviews. Typical complaints: the restaurant says the branch doesn't participate; there are no instructions; the balance vanished; redeem freezes the screen. |
| 2 | **App crashes, won't open, update loop, or the OTP code never arrives** | 24 | 24% | Concentrated in Sep 2025 after an update (Android 15). Engineering stability, not product design. |
| 3 | **Subscription charged without clear consent, or hard to cancel** | 20 | 20% | 6 reviews say paying a bill once by QR led to a Qlub+ subscription, and 3 more can't say how they were enrolled. Others report the AED 15 trial-cancellation charge, double monthly charges, or no way to cancel in the app. Mostly AED, so mostly UAE. |
| 4 | **Confusion: paying vs the app vs what the restaurant accepts** | 7 | 7% | Staff don't know how it works; a branch with Qlub table signage refused Qlub payment (Riyadh); users unsure how QR payment and the app relate. |
| 5 | **Tip or fee appears late, or a tip is pre-selected** | 6 | 6% | "Tip and service charges are forced at the payment gateway, not before checkout"; a 5% tip pre-selected; "so we're forced to tip?!"; a bill shown at 31.5 but charged 33.71. |
| 6 | **Support unresponsive (WhatsApp, no reply)** | 6 | 6% | Often appears together with themes 1 and 3. |
| 7 | **Payment slow, failed, or deducted without completing** | 4 | 4% | "Wait 10+ minutes for the payment to register"; wallet debited although payment didn't complete; Google Pay fails; bill credit never appears (verification loop). |
| 8 | **Gift cards expire quickly or don't work at the restaurant** | 3 | 3% | Includes one report of a restaurant leaving the network without a gift-card refund. |
| – | Vague, no specific issue ("useless", "scam", "not good") | ~12 | – | Not used. |

## Representative reports (paraphrased)

**Subscription consent (theme 3)**
- *2026-09-29, Play:* paid once at a restaurant and was signed up for a subscription they didn't want; cancelling is not simple.
- *2026-07-13, Play:* installed via a restaurant QR code and was charged for a subscription with "zero disclosure or explicit opt-in".
- *2026-03-04, Play, Arabic:* found themselves subscribed and charged AED 15 a month for two months just for paying a restaurant bill by table QR. Says the restaurant or app should have warned them.
- *2026-09-14, Play:* charged AED 15 when cancelling the trial and needed support for a refund.

**Tip and fee timing (theme 5)**
- *2026-08-29, Play:* "tip and service charges [appear] once [you] reach the payment gateway, not before check out."
- *2025-08-17, Play, Arabic:* a tip percentage that is pre-selected automatically is in itself taking advantage of the customer; "we want a correction, not a justification."
- *2025-06-20, Play, Arabic:* the cashback can't be used, and the 5% restaurant tip is pre-set, so "pay attention before paying."
- Context, not counted: a 2023 r/dubai post reports a pre-selected 7% tip followed by an "are you sure?" screen.

**Payment state (theme 7)**
- *2026-01-10, Play:* every payment takes 10+ minutes to register and often doesn't go through.
- *2025-05-29, Play, Arabic:* the wallet was debited although the payment wasn't completed.
- Context, not counted: an earlier desk-research note cites a 20 Sep 2026 Play review saying a failed payment was stuck as an "ongoing transaction" and retrying was blocked. It didn't appear in this pull, so treat it as reported once.

**Cashback (theme 1)**
- *2025-11-06, Play, Arabic:* has cashback, but the restaurants are all in Jeddah and Riyadh, with none in the Eastern Province to spend it at.
- *2025-08-28, Play:* the offer is listed in the app, but the restaurant says the service isn't available at that branch.
- *2026-06-21, App Store:* "have to keep turning on the cash back eligibility, and not all restaurants give you cashback."

**Confusion (theme 4)**
- *2026-06-05, App Store:* "restaurants don't know how the app works"; the bill can't be credited; endless verification loop.
- *2025-10-21, Play, Arabic:* at a Riyadh branch with Qlub on every table, staff refused Qlub payment.

## What this means for the concept

1. **Pay first, membership later, clearly separated.** Themes 3 and 4 make up 27% of reviews. The QR checkout should never enrol anyone. Any Qlub+ offer should appear *after* payment, unticked, with the trial terms in plain words and cancel in one tap.
2. **The full total before the pay button, and no pre-selected tip** (theme 5). This matters more in KSA, where the Ministry of Commerce reportedly banned restaurant service charges in 2012. That still needs checking.
3. **A payment state machine that can't get stuck or double-debit** (theme 7). Use idempotency keys, timeouts and recovery, and give the diner a clear paid / pending / failed status.
4. **Cashback the diner can actually use** (theme 1). Show "where can I use it near me" filtered by branch, with the participation rules stated plainly. This is the single biggest complaint.
5. **Out of scope for a web concept:** app crashes (theme 2). Note it in the brief as an observation only.

## Not established

- No verified data breach, lawsuit or SAMA enforcement against Qlub was found.
- How common each issue is across Qlub's whole user base is unknown; these are app-store reviews only.
- Exact Qlub fees, the current Qlub+ price in KSA, and whether the 2012 service-charge ban is still enforced all need checking.
