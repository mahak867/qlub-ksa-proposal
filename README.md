# A proposal for Qlub's KSA team: clearer pay-at-table

> **Independent proposal, not affiliated with or endorsed by Qlub.** Built by Mahak Fahad from public information only, as suggestions for Qlub's existing product. This is not a competing product: it has no customers, no pricing and no business plan. It uses demo data and a mock payment gateway; no real cards are charged and nothing is sent to ZATCA.

**Try it:** https://qlub-pay-web-mahak867s-projects.vercel.app · **90-second video:** https://drive.google.com/file/d/1DqjujF_QsnroKnIbuZOYYXfAjtVtgXMR/view · **One-page brief:** [docs/BRIEF.md](docs/BRIEF.md)

Demo phone code `123456` · restaurant PIN `2468`

## Why this exists

Qlub's QR pay-at-table is fast, and diners who use it say so. The frustration in public reviews is mostly about what surrounds the payment. I read and coded **101 one- and two-star reviews** of the Qlub+ app on the Saudi Google Play and App Store pages ([evidence](docs/evidence.md)):

| What reviewers report | Share |
|---|---|
| Cashback or points can't be used, or the balance disappears | 26% |
| App crashes or won't open (mostly after one update) | 24% |
| A subscription they say they didn't knowingly agree to, or can't cancel | 20% |
| Confusion between paying the bill and the rewards app | 7% |
| Tip pre-selected, or tip and fees shown only at the payment step | 6% |
| Payment slow, failed, or stuck | 4% |

These are user reports, not proof, and some come from UAE users. The [evidence file](docs/evidence.md) explains the method and its limits.

## Four suggested improvements

Each one is a change to how Qlub's flows could work, built so the system enforces it rather than relying on good intentions:

| Suggestion | What the diner sees | How it's enforced in the prototype |
|---|---|---|
| **1. The amount you review is the amount you're charged** | Full total above the pay button; tip optional, nothing pre-selected | The server recomputes the total and refuses any charge that differs from what was shown |
| **2. Paying never signs you up** | Qlub+ offered after payment, unticked, price and cancellation in one sentence; cancel in one tap | The payment request has no membership field; joining needs a verified phone and a stored consent record |
| **3. Every payment finishes, and never charges twice** | "Paid" or "Not charged — try again" within 90 seconds, never an endless "ongoing" | Idempotency keys, a payment state machine with a deadline, a recovery job, automatic refund of late duplicates |
| **4. You can see where your cashback works** | A "where can I use it" page by city and branch | One per-branch setting drives both the finder and checkout |

Also included: split bills (by item, equally, or by amount) that map to **one ZATCA simplified invoice** with a QR code; an Arabic-first interface with English; a printable bilingual card that explains paying and rewards to staff; and a restaurant view with reconciliation and a POS menu-sync check.

The tipping change has a trade-off: Qlub's tip prompts raise staff income. The brief suggests **testing** suggested amounts with none pre-selected, and measuring tips and complaints together, rather than assuming either way.

## What I'd like

Fifteen minutes of feedback from someone who knows the KSA product: what I've misunderstood, and what you've already solved. If any part is useful, I'd be glad to help build or test it.

---

## For engineers

### Layout

```
packages/core   pure TypeScript: money in halalas, splits, payment states, ZATCA TLV QR, mock gateway
apps/api        NestJS + Prisma + Postgres (runs as a server locally, or one serverless function on Vercel)
apps/web        Next.js, Arabic-first RTL with English toggle
docs/           evidence, spec, brief, demo script, outreach notes, build log
```

### Run locally

Needs Node 22, pnpm 10 and Postgres 16.

```bash
pnpm install
pnpm --filter @qlub-pay/core build
cp apps/api/.env.example apps/api/.env   # set DATABASE_URL
pnpm --filter api db:push
pnpm --filter api build && (cd apps/api && SEED_ON_START=1 node dist/main.js)
# second terminal
cp apps/web/.env.example apps/web/.env.local
pnpm --filter web dev
```

Open http://localhost:3000 and press **Scan table 12**. **Demo controls** make the next payment hang, decline or succeed late, and run recovery without waiting 90 seconds.

### Tests

```bash
pnpm -r test   # core: 18 unit tests · api: 24 tests against a real Postgres
```

They cover split maths, two diners racing for the last item, idempotent retries, tampered totals, hung payments expiring and releasing their share, late captures settled or refunded, one invoice per split bill with a decodable QR, paying never creating a membership, consent and one-tap cancel, cashback holds, session tokens and the restaurant PIN. CI runs them on every push.

### What is real and what is mocked

| Real | Mocked or placeholder |
|---|---|
| Split, tip and VAT maths in integer halalas | Card payments (mock gateway with scripted outcomes) |
| Idempotency, state machine, recovery, late-capture handling | Refund execution and webhooks (simulated) |
| ZATCA QR tags 1–5 (TLV, UTF-8 byte lengths) | Tags 6–9, XML hash, signing and reporting |
| Consent records, one-tap cancel, signed sessions | SMS codes (fixed `123456`), restaurant PIN (fixed `2468`), Qlub+ price and trial |
| Per-branch cashback rules and ledger | POS / Foodics menu feed |

### Security notes

- Paying needs no account. A phone sign-in is only needed to earn or spend cashback and to manage a membership; only that phone's session can see its wallet or membership.
- Restaurants sign in with a branch PIN and see only their branch.
- Set `SESSION_SECRET` (32+ characters) outside local development, and `DEMO_MODE=0` to turn off the demo controls.
- Demo-grade only: fixed codes, in-memory rate limits, no real SMS, card processing or ZATCA submission.

### Deploying

`apps/web` deploys to Vercel as a Next.js app with `NEXT_PUBLIC_API_URL`. `apps/api` deploys as one serverless function (root directory `apps/api`, see `apps/api/vercel.json`) with `DATABASE_URL`, `SESSION_SECRET` and `CORS_ORIGIN`; the build creates the tables and seeds an empty database. With no background timer on serverless, an overdue payment is finished the moment anyone reads it.

### How it was built

With AI coding agents: one model for the spec, code review and pitch, another for the code and tests, with me directing, reviewing and testing every step. Details: [docs/BUILD_LOG.md](docs/BUILD_LOG.md). Design: [docs/SPEC.md](docs/SPEC.md).

All rights reserved. The code is shared to show the proposal, not licensed for reuse.
