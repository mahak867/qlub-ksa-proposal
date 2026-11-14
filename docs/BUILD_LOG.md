# Build log (AI-native)

How this project was built with AI agents, and who did what.

| Phase | Model / agent | What |
|---|---|---|
| 1. Evidence | Opus 5.5 (main session) | Scraped public Google Play (SA) and App Store (SA) reviews; coded 101 low-star reviews by hand into themes → `docs/evidence.md` |
| 2. Spec | Fable 5.2 (main session) | Designed the four enforced promises, split rules, payment state machine with deadline and recovery, idempotency, ZATCA invoice model, consent-based membership, data model, API and test list → `docs/SPEC.md` |
| 3. Build | Opus 5.5 (main session) | pnpm monorepo: `packages/core` (pure logic + 18 unit tests), `apps/api` (NestJS + Prisma + Postgres, 15 DB-backed tests), `apps/web` (Next.js, Arabic-first RTL, 11 screens). End-to-end browser run (Playwright) of pay → stuck payment → recovery → retry → invoice. GitHub Actions CI |
