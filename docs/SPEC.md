# Spec: pay-at-table clarity concept (KSA)

> Unofficial concept — not affiliated with Qlub. Public information only. Evidence for every design choice is in [evidence.md](evidence.md).

## 1. What this proves

Four promises, each tied to a reported complaint and each enforced by the system, not by good intentions:

| # | Promise | Complaint it answers | How it is enforced |
|---|---|---|---|
| P1 | **The amount you review is the amount you are charged.** | Tip and fees appear at the payment step; "bill showed 31.5, charged 33.71" | The client sends the total it displayed; the server recomputes and rejects any mismatch (§5.3) |
| P2 | **Paying never enrols you in anything.** | "Paid once and got subscribed" (20% of low-star reviews) | The payment API has no membership field at all. Membership needs its own call with a stored consent record (§7) |
| P3 | **A payment always reaches a final state, and never charges twice.** | "Ongoing transaction" blocks retry; wallet debited without completing | Idempotency keys plus a state machine with a deadline and a recovery job (§5) |
| P4 | **You can see where your cashback works before you rely on it.** | Cashback can't be used (26%, the largest theme) | Per-branch participation is the source of truth for both the finder page and checkout (§8) |

Non-goals: native app stability (crashes are 24% of complaints but are outside a web concept), real card processing, real ZATCA submission, real Foodics integration, merchant onboarding.

## 2. Stack and layout

```
qlub-pay/
  packages/core/     pure TypeScript, no I/O: money, split, tip, payment state machine, TLV QR
  apps/api/          NestJS + Prisma + Postgres
  apps/web/          Next.js (App Router), Arabic-first RTL with English toggle
  docs/
```

- pnpm workspace, TypeScript strict everywhere, Vitest for tests.
- **All rules live in `packages/core`** so they are unit-tested without a database and shared by API and web. The API never trusts totals computed in the browser.
- CI (GitHub Actions): install, lint, typecheck, test, build.

## 3. Money rules

- All amounts are **integers in halalas** (1 SAR = 100 halalas). No floats anywhere. Format only at the display edge.
- Menu prices are **VAT-inclusive** (15%), as is normal for consumer prices in KSA. For an inclusive amount `g`: `vat = round(g × 15 / 115)`, `net = g − vat`. VAT is computed **once on the bill total**, not per line, so split payments can never drift from the invoice.
- **No diner-side fee exists in this concept.** If a restaurant's POS sends a service-charge line, it is an ordinary bill line: visible from the first screen, included in the total, never added later. (Whether restaurants in KSA may add one at all is unverified; see §12.)
- **Tip** is per payer, voluntary, default **0**, and sits outside the tax invoice.

## 4. Splitting a bill

A bill has a fixed `total`. Each diner creates a **share**: a claim on part of the bill.

| Mode | Share amount |
|---|---|
| Whole bill | Everything still unclaimed |
| By item | Sum of the items (or item units) the diner selects |
| Equal | `total ÷ n` for `n` people; the remainder halalas go one each to the first shares created, so the shares always sum exactly to `total` |
| Custom | Any amount from 1 halala up to what is still unclaimed |

Rules:
1. **Invariant:** `sum(paid shares) + sum(reserved shares) ≤ bill.total`, enforced inside one database transaction that locks the bill row.
2. A share is **reserved** while its payment is in flight and is released the moment that payment fails or expires. Two diners can never pay for the same item.
3. The split mode is fixed by the first share on a bill. Mixing by-item and equal on one bill creates ambiguous remainders, so the UI offers "pay the rest" instead.
4. When paid shares equal the total, the bill becomes `PAID` and the invoice is issued (§6).

## 5. Payments

### 5.1 State machine

```
CREATED ──► PROCESSING ──► SUCCEEDED
                │
                ├────────► FAILED        (gateway declined, diner can retry at once)
                │
                └────────► EXPIRED       (no answer by the deadline; reservation released)

EXPIRED / FAILED ──► late success from gateway ──► REFUND_DUE ──► REFUNDED
```

- `SUCCEEDED`, `FAILED`, `EXPIRED`, `REFUNDED` are final. **`PROCESSING` has a hard deadline of 90 seconds.** Nothing can stay "ongoing".
- Every transition is a compare-and-set on the current state (`UPDATE … WHERE id = ? AND state = ?`). A transition that loses the race does nothing.

### 5.2 Idempotency (no double charge)

- `POST /payments` requires an `Idempotency-Key` header, a UUID the browser creates once per press of the pay button and keeps across network retries.
- The server stores `(key, request hash, response)`. Same key and same body returns the stored response without touching the gateway. Same key with a different body returns `422`.
- The key is passed on to the gateway as its own idempotency reference, so a retry after a timeout cannot create a second charge there either.
- A share allows **one active payment at a time**. A new attempt on the same share is accepted only when the previous one is final, which §5.1 guarantees within 90 seconds.

### 5.3 The total check (P1)

The request carries `expectedTotal` (share plus tip, exactly as displayed). The server recomputes from its own data. If they differ, it returns `409 TOTAL_CHANGED` with the correct breakdown and charges nothing. The web app then shows the new total and asks again.

### 5.4 Recovery job

Runs every 15 seconds. For each payment in `PROCESSING` past its deadline:
1. Ask the gateway for the status by idempotency reference.
2. Captured → `SUCCEEDED`. Declined or not found → `EXPIRED`, and the share's reservation is released.
3. If a success arrives later for a payment already `EXPIRED` or `FAILED` (webhook or a later poll): if the share is still unpaid, accept it as `SUCCEEDED`; if someone else has since paid it, mark `REFUND_DUE` and refund automatically. The diner sees this on their status page. **Money is never kept without a matching paid share.**

### 5.5 What the diner sees

One status page per payment, safe to reload and to share: **Paid** (receipt), **Checking with your bank** (countdown, at most 90 seconds, no action needed), **Not charged — try again** (retry button is active immediately), **Refund on its way** (amount and reference). The restaurant's table view shows the same states.

### 5.6 Mock gateway

`packages/core` defines a `Gateway` interface. The mock implementation supports scripted outcomes for the demo and tests: approve, decline, hang (never answers), and late success. Methods shown: mada and Apple Pay buttons, both mocked and labelled as demo.

## 6. Tax invoice and receipts (ZATCA)

Working model, to be confirmed with a tax adviser:

- **The restaurant issues the tax invoice through its POS.** A payment app does not. In this concept the API plays the POS role so the flow can be demonstrated end to end.
- **One bill produces one simplified tax invoice**, issued when the bill is fully paid. Split payments are payments against that one invoice.
- **Each payer gets a payment receipt**, which is not a tax invoice. It shows their amount, their tip, the payment reference and the invoice number, and links to the invoice once it exists.
- **Tips are not on the invoice.** No ZATCA ruling on voluntary tips was found (§12).

QR code on the invoice:

| Tag | Content | Status in this concept |
|---|---|---|
| 1 | Seller name (UTF-8) | Real |
| 2 | VAT registration number (15 digits) | Real encoding, demo number |
| 3 | Timestamp, ISO 8601 UTC, e.g. `2026-11-14T18:30:00Z` | Real |
| 4 | Invoice total with VAT, e.g. `115.00` | Real |
| 5 | VAT total, e.g. `15.00` | Real |
| 6 | Hash of the invoice XML | **Mocked**, labelled |
| 7 | ECDSA signature | **Mocked**, labelled |
| 8 | Public key | **Mocked**, labelled |
| 9 | ZATCA stamp of the public key | **Mocked**, labelled; applicability to simplified invoices unverified |

Encoding: each field is `tag (1 byte) · length (1 byte) · value (raw bytes)`, concatenated and Base64-encoded. **Length counts bytes, not characters**, which matters for Arabic seller names. The encoder rejects values over 255 bytes. Tests decode the QR and compare every field, including an Arabic name.

Also demonstrated, mocked and labelled: an invoice counter and a previous-invoice hash chain per branch, and a "reported to ZATCA" status with the 24-hour deadline shown on the merchant view.

## 7. Membership offer (P2)

Prices and trial length are **placeholders**; real Qlub+ terms in KSA are unverified.

1. The offer appears **only on the receipt screen, after a successful payment**, as a separate card. Nothing is pre-ticked. "No thanks" and "Join" have equal visual weight.
2. The card states in plain words: the price per month, when the first charge happens, that it renews, and how to cancel.
3. Joining calls `POST /memberships` with the phone number (verified by a one-time code, mocked) and creates a **consent record**: the exact text shown, its version, language, timestamp and the payment it followed. No consent record, no membership.
4. **Cancel is one tap** from a link in every reminder and from the membership page. It takes effect at once, costs nothing, and confirms on screen with the end date.
5. A **reminder** is sent 3 days before each renewal and before a trial converts (mocked job that writes to a notification log shown in the demo).

## 8. Cashback (P4)

- A wallet is tied to a verified phone number. A ledger records every earn, spend and expiry, so a balance can always be explained line by line.
- **Participation is per branch**, with two flags: earns cashback, accepts cashback.
- **Finder page** ("Where can I use my cashback?"): balance, soonest expiry, and branches that accept it, filtered by city (Riyadh, Jeddah, Eastern Province and so on). Branches that only earn are shown separately and labelled.
- **At checkout:** if the branch accepts cashback and the diner is signed in, the review screen offers "Use SAR X of your balance" as an unticked option. If the branch does not accept it, the screen says so before payment.
- Cashback reduces what the payer is charged. It does not change the bill total or the invoice.
- Expiry reminder 7 days before any amount expires (same mocked notification log).

## 9. Screens (web)

Arabic first, `dir="rtl"`, English toggle that keeps the diner on the same screen. Amounts in SAR with Western digits. Footer on every page: "Unofficial concept — not affiliated with Qlub."

| # | Route | Purpose | Must show |
|---|---|---|---|
| 1 | `/` | Demo entry | Explains the concept; "Scan table 12" demo button; links to staff card and merchant view |
| 2 | `/t/[token]` | Bill | Restaurant, table, every line, VAT-inclusive total, what is already paid; banner "No app needed. Pay here in your browser." |
| 3 | `/t/[token]/split` | Choose a split | Whole, by item, equal, custom; live "your share" |
| 4 | `/t/[token]/review` | Review before paying | Share, tip picker (0 selected; presets and custom; "No tip" is the default state, not a button to hunt for), optional cashback, **final total in large type directly above the pay button**. No screen follows that changes the amount. No confirmation prompt when the tip is zero |
| 5 | `/pay/[id]` | Status | The four states in §5.5 |
| 6 | `/pay/[id]/receipt` | Receipt | Payer's amounts and reference; invoice QR once the bill is fully paid; below it, the optional membership card (§7) |
| 7 | `/membership` | Manage | Status, next charge date, one-tap cancel, consent record |
| 8 | `/cashback` | Finder | §8 |
| 9 | `/staff-card` | Printable A5 card | Arabic and English: how to pay (scan, no app), how tipping works (optional), what the rewards app is (optional, separate), what to do if a payment shows "checking" |
| 10 | `/merchant` | Restaurant view | Tables with live payment states, reconciliation (bill total against payments), invoice and reporting status, menu sync health (§10) |
| 11 | `/demo` | Demo controls | Make the next payment approve, decline, hang, or succeed late, so the recovery behaviour can be shown live |

Accessibility: 44px touch targets, WCAG AA contrast, status changes announced to screen readers, nothing conveyed by colour alone.

## 10. Menu sync health (mock)

`GET /merchant/branches/:id/sync-health` compares a mocked POS menu feed with the stored menu and returns: last successful sync, items that differ in price or are missing, and tables with no QR mapping. The merchant view shows a green, amber or red status with the list. This answers the manual re-sync and manual table mapping described in the POS vendor's public help pages.

## 11. Data model

| Table | Key fields |
|---|---|
| `Restaurant` | name (ar, en), vatNumber |
| `Branch` | restaurantId, city, earnsCashback, acceptsCashback, invoiceCounter, lastInvoiceHash |
| `Table` | branchId, label, token (random, unguessable, unique) |
| `Bill` | tableId, status (`OPEN`, `PAID`), total, splitMode, version |
| `BillItem` | billId, name (ar, en), quantity, unitPrice |
| `Share` | billId, mode, amount, itemRefs, status (`RESERVED`, `PAID`, `RELEASED`) |
| `Payment` | shareId, amount, tip, cashbackUsed, state, method, gatewayRef, deadlineAt, timestamps |
| `IdempotencyRecord` | key (unique), requestHash, responseBody, statusCode |
| `Invoice` | billId (unique), number, issuedAt, total, vat, qrBase64, previousHash, reportStatus |
| `Membership` | phone, status, startedAt, nextChargeAt, cancelledAt |
| `ConsentRecord` | membershipId, paymentId, textVersion, textShown, locale, acceptedAt |
| `CashbackEntry` | phone, branchId, type (`EARN`, `SPEND`, `EXPIRE`), amount, expiresAt |
| `Notification` | phone, kind, body, sendAt, sentAt (mock outbox) |
| `Event` | name, billId, paymentId, properties, at (metrics) |

## 12. API

| Method and path | Purpose |
|---|---|
| `GET /tables/:token/bill` | Bill, items, paid and reserved amounts |
| `POST /bills/:id/shares` | Create a share (reserves it) |
| `DELETE /shares/:id` | Release an unpaid share |
| `POST /payments` | Pay a share. Needs `Idempotency-Key`. Body: shareId, tip, cashbackUse, method, expectedTotal. **No membership field exists** |
| `GET /payments/:id` | Status for the status page |
| `POST /gateway/webhook` | Mock gateway callback (late success) |
| `GET /bills/:id/invoice` | Invoice and QR, once the bill is paid |
| `POST /memberships` · `DELETE /memberships/:id` | Join with consent · cancel |
| `GET /cashback?phone=` · `GET /cashback/branches?city=` | Wallet · finder |
| `GET /merchant/branches/:id/overview` · `/sync-health` | Merchant view |
| `POST /demo/gateway-mode` · `POST /demo/reset` | Demo controls and seed data |

Errors use one shape: `{ code, message, details }`. Codes include `TOTAL_CHANGED`, `SHARE_UNAVAILABLE`, `PAYMENT_IN_PROGRESS`, `IDEMPOTENCY_MISMATCH`.

Security and privacy: table tokens are random and carry no meaning; paying needs no account and no personal data; a phone number is collected only for membership or cashback; rate limits on share creation and payment; no card data is handled (the gateway is a mock). A real deployment would need a review against the Saudi data protection law (PDPL).

## 13. Tests that must exist

| Area | Cases |
|---|---|
| Split | Equal split of an amount that doesn't divide; shares always sum to the total; by-item with quantities; custom share over the remainder is rejected |
| Concurrency | Two diners claim the last item at once: exactly one succeeds |
| Idempotency | Same key twice returns one payment and one gateway call; same key with a different body is rejected |
| State machine | Every illegal transition is rejected; a hung payment expires at the deadline and releases its share; retry works immediately afterwards |
| Late success | Share still free: accepted. Share already paid by someone else: refund is created |
| Total check | A tampered `expectedTotal` is rejected and nothing is charged |
| Membership | Payment alone never creates a membership; joining without consent text fails; cancel is immediate |
| TLV | Round trip of all five real tags; Arabic seller name uses byte length; value over 255 bytes is rejected |
| VAT | `vat + net = total` for odd amounts |

## 14. Metrics to propose for a pilot

| Metric | Why |
|---|---|
| Checkout completion rate (bill viewed to paid) | The main health measure; clarity should raise it |
| Share of payments with a tip, and average tip | Shows what an opt-in tip does to staff income; this is the trade-off Qlub will ask about first |
| Payments reaching a final state within 90 seconds (target 100%) and duplicate charges (target 0) | P3 |
| Support contacts per 1,000 payments mentioning fees, tips or subscriptions | P1 and P2 |
| Membership opt-in rate after payment, and cancellations within 30 days | A lower opt-in with far fewer cancellations and refunds is the expected and better result |
| Cashback redemption rate among members with a balance | P4 |

The `Event` table records the funnel steps so the demo can show these numbers on the merchant view.

## 15. To verify before anything is sent

- Current Qlub+ price and trial terms in KSA.
- Whether the 2012 Ministry of Commerce service-charge rule is still in force.
- VAT treatment of voluntary tips.
- Whether QR tag 9 applies to simplified invoices, and the first-invoice hash value.
- Whether Qlub's current checkout still pre-selects a tip in KSA (the reports are from 2023 to 2025).
