# qlub-pay — pay-at-table clarity concept (KSA)

> **Unofficial concept — not affiliated with, endorsed by, or built for Qlub.** Independent research and prototype using public information only. Demo data and a mock payment gateway; no real cards, no real ZATCA submission.

A Saudi-first concept that addresses what diners report in public reviews: confusion between QR pay-at-table and the Qlub+ membership, tips and fees that appear late, stuck payments, and cashback that can't be used. Evidence: [docs/evidence.md](docs/evidence.md) (101 low-star reviews coded by theme).

## Four promises, enforced in code

| Promise | Where it is enforced |
|---|---|
| The amount you review is the amount you are charged | `expectedTotal` is recomputed server-side; any mismatch returns `TOTAL_CHANGED` and nothing is charged |
| Paying never enrols you | The payment API has no membership field (`strict` schema rejects extra keys). Membership needs its own call with a stored consent record |
| A payment always ends, and never charges twice | Idempotency keys, compare-and-set state machine, 90-second deadline, recovery job, automatic refund of late duplicates |
| You see where cashback works | Per-branch `acceptsCashback` drives both the finder page and checkout |

## Layout

```
packages/core   pure TypeScript: money (halalas), splits, payment states, ZATCA TLV QR, mock gateway
apps/api        NestJS + Prisma + Postgres
apps/web        Next.js, Arabic-first RTL with English toggle
docs/           evidence, spec, build log
```

## Run locally

Needs Node 22, pnpm 10 and Postgres 16.

```bash
pnpm install
pnpm --filter @qlub-pay/core build
cp apps/api/.env.example apps/api/.env   # edit DATABASE_URL
pnpm --filter api db:push
pnpm --filter api build && (cd apps/api && SEED_ON_START=1 node dist/main.js)
# new terminal
cp apps/web/.env.example apps/web/.env.local
pnpm --filter web dev
```

Open http://localhost:3000, press "Scan table 12". Use **Demo controls** to make the next payment hang, decline or succeed late, and to run the recovery job without waiting 90 seconds.

## Tests

```bash
pnpm -r test   # core: 18 unit tests · api: 24 tests against a real Postgres (qlubpay_test)
```

Covered: split maths, two diners racing for the last item, idempotent retries, tampered totals, hung payments expiring and releasing their share, late success accepted or refunded, one invoice per split bill with a decodable QR, paying never creating a membership, consent and one-tap cancel, cashback per branch.

## What is real and what is mocked

| Real | Mocked / placeholder |
|---|---|
| Split, tip and VAT maths in integer halalas | Card payments (mock gateway with scripted outcomes) |
| Idempotency, state machine, recovery, refunds-on-duplicate logic | Refund execution, webhooks (simulated from Demo controls) |
| ZATCA QR tags 1–5 (TLV, UTF-8 byte lengths) | Tags 6–9, XML hash, signing, ZATCA reporting |
| Consent record and one-tap cancel | OTP (`123456`), reminder delivery (stored only), membership price and trial (placeholders) |
| Per-branch cashback rules and ledger | POS / Foodics menu feed |

## Sign-in and security (demo)

- **Diners** sign in with a phone number and a one-time code (demo code `123456`, nothing is sent). This gives a signed session token; only that session can see or spend its wallet, or view and cancel its membership. Paying needs no sign-in at all.
- **Restaurants** sign in with a branch PIN (demo PIN `2468`) and can only see their own branch.
- Set `SESSION_SECRET` (32+ characters) anywhere other than your laptop. Set `DEMO_MODE=0` to turn off the demo controls.
- Still demo-grade: the OTP and PIN are fixed values, rate limits are in memory per instance, and there is no real SMS, card processing or ZATCA submission.

## Deploying

`apps/web` deploys to Vercel as a normal Next.js app (set `NEXT_PUBLIC_API_URL`). `apps/api` deploys to Vercel as one serverless function (`apps/api/vercel.json`, root directory `apps/api`) with `DATABASE_URL`, `SESSION_SECRET` and `CORS_ORIGIN`. On serverless there is no background timer: an overdue payment is finished the moment anyone reads it.

- Brief: [docs/BRIEF.md](docs/BRIEF.md) · Demo script: [docs/DEMO_SCRIPT.md](docs/DEMO_SCRIPT.md)
- Spec: [docs/SPEC.md](docs/SPEC.md)
- Build log: [docs/BUILD_LOG.md](docs/BUILD_LOG.md)
