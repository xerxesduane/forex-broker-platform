# Assumptions

Recorded working assumptions for the Aurion Markets demonstration
platform. These stand in for the "decisions required before
implementation" in the source blueprint, scoped to what a private demo
needs. None of these are compliance, legal, or launch decisions — they
are only load-bearing for this demo build and must be revisited before
any real-money, real-KYC, or real-MT5 phase.

## Product identity

- **Demo brand name:** "Aurion Markets" — an invented name chosen only to
  give the demo a coherent, original identity distinct from the source
  reference product and from any real brokerage. Not a trademark search
  target; a real launch needs proper brand/legal clearance.
- **Visual identity:** Original — navy/graphite base with a warm gold
  accent, no cryptocurrency imagery, communicates "regulated financial
  operations" rather than retail crypto trading.

## Jurisdiction, regulation, compliance

- No jurisdiction is targeted by this demo. All regulatory, licensing,
  AML/KYC policy, sanctions-screening, and retention requirements are
  explicitly **out of scope** and left as configuration points for a
  future compliance-reviewed phase.
- KYC "approval" in this demo is a human-in-the-loop decision by a seeded
  KYC analyst role, not an automated compliance determination.

## Accounts and trading

- Slice 1 only implements **demo** MT5 accounts. Demo accounts are
  auto-provisioned on request (no ops approval step), matching how real
  brokers typically treat demo accounts — no capital is at risk.
  **Real** account requests are modeled in the schema (account_type
  enum) but not wired to a request/approval flow in this pass.
- One simulated MT5 server/group is seeded (`AurionMarkets-Demo`,
  `demo\standard`). Multi-server topology is deferred.
- Default demo account parameters: base currency USD, leverage 1:100,
  starting balance 10,000.00 (clearly labeled simulated).

## KYC

- Required "document" for the demo is a single placeholder upload
  (accepted as metadata only — filename, declared type, size — the demo
  document-storage adapter does not require real file content to be a
  genuine identity document, and no real document handling occurs).
- KYC states: `not_started`, `submitted`, `in_review`, `approved`,
  `rejected`, `needs_revision`.

## Money and ledger

- No real or simulated money movement is implemented in slice 1. Wallet
  and ledger tables exist in the schema (per the domain requirements)
  but carry no transactions yet — this avoids building ledger UI ahead
  of the deposit/withdrawal phase while keeping the schema stable.

## Integrations

- `INTEGRATIONS_MODE=simulation` is the only supported mode in this
  build. Every adapter (MT5, KYC, payments, email, SMS, document
  storage) has a typed interface and a simulated implementation; no
  adapter reads real provider credentials while in simulation mode.
- Email/SMS "sending" in simulation mode writes to a local outbox
  (console log + `integration_events` row) rather than calling a real
  provider.

## Environments

- Local development targets Supabase's local stack (`supabase start`,
  which requires Docker). The environment used to build this project has
  neither Docker nor a running Postgres instance available, so live
  database/E2E verification could not be executed here — see
  `docs/testing/vertical-slice-report.md` for exactly what was verified
  instead (type-check, lint, build, and DB-independent unit tests) and
  what remains to be run locally.
- Staging is assumed to be a password-protected Vercel preview or
  similar, pointed at a separate Supabase project seeded with the same
  deterministic demo data.

## Access and demo credentials

- Demo credentials (see README) use obviously fictional names/emails
  (`@example.com` / `.test` style) and simple, clearly-labeled demo
  passwords. This is acceptable only because the platform never leaves
  simulation mode; it is not a production credential policy.
