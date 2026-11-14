# Build log (AI-native)

How this project was built with AI agents, and who did what.

| Phase | Model / agent | What |
|---|---|---|
| 1. Evidence | Opus 5.5 (main session) | Scraped public Google Play (SA) and App Store (SA) reviews; coded 101 low-star reviews by hand into themes → `docs/evidence.md` |
| 2. Spec | Fable 5.2 (main session) | Designed the four enforced promises, split rules, payment state machine with deadline and recovery, idempotency, ZATCA invoice model, consent-based membership, data model, API and test list → `docs/SPEC.md` |
| 3. Build | Opus 5.5 (main session) | pnpm monorepo: `packages/core` (pure logic + 18 unit tests), `apps/api` (NestJS + Prisma + Postgres, 15 DB-backed tests), `apps/web` (Next.js, Arabic-first RTL, 11 screens). End-to-end browser run (Playwright) of pay → stuck payment → recovery → retry → invoice. GitHub Actions CI |
| 4. Review | Fable 5.2 (subagent, read-only) | Reviewed the code against the spec: 12 findings (3 high, 6 medium, 3 low) |
| 4b. Fixes | Opus 5.5 (main session) | Fixed 10 of 12: late-capture re-polling and gateway void, cashback hold under a per-phone lock, idempotent replay that always reaches the payment, locking for share release, the stale-share sweep and invoice numbers, per-item error isolation in recovery, server-loaded share amount and visible new total on `TOTAL_CHANGED`, demo-route switch, rate limits, membership checks, translated errors and accessibility. 6 new regression tests (21 API tests total). The other 2 are listed as known limitations in the README |
| 5. Pitch | Fable 5.2 (main session) | One-page brief, 90-second demo script, outreach drafts (email, LinkedIn note, two follow-ups) → `docs/BRIEF.md`, `docs/DEMO_SCRIPT.md`, `docs/OUTREACH.md`. Nothing was sent |
| 6. Upgrade | Opus 5.5 (main session) | Phone sign-in with signed sessions (wallet, cashback and membership are owner-only), restaurant PIN login, earn cashback without spending, overdue payments finished on read (serverless-safe), Vercel serverless entry. 24 API tests; browser run covers sign-in and PIN |

## How the work was split

- **Fable 5.2** did the thinking that is expensive to get wrong: the spec, the code review and the pitch.
- **Opus 5.5** did the volume: research collection, all code, tests, fixes and browser checks.
- **The human** chose the direction (help Qlub, not compete), set the rules (public information only, nothing sent without approval) and approves every outward step.
- Every claim in the brief traces to `docs/evidence.md`; every promise in the spec traces to a test.
