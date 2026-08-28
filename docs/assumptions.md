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
  which requires Docker). The machine this project was built on has
  neither Docker nor WSL, so local Supabase was never started; instead,
  a hosted Supabase project (`aurion-markets-demo`) was created and used
  for both local development and the deployed Vercel app — see
  `docs/testing/vertical-slice-report.md` for what that let us verify
  live (migrations, RLS, RBAC, auth, seeded data) versus what still
  needs a real browser (Playwright) or Docker to fully close out.
- Deployed to Vercel at https://forex-broker-platform.vercel.app,
  connected to the `xerxesduane/forex-broker-platform` GitHub repo so
  every push to `main` auto-deploys. This is currently acting as both
  "staging" and the demo URL to share with a client — a real engagement
  would split those, pointing staging at its own Supabase project rather
  than reusing the demo one.
- **Discovered constraint (via live testing):** Supabase's hosted Auth
  rejects the reserved `.test` TLD on the public `/auth/v1/signup`
  endpoint (`email_address_invalid`) — it validates the domain, not just
  RFC format. The Admin API (`auth.admin.createUser`, used by
  `supabase/seed/seed.ts`) is not subject to this, so the seeded
  `@demo.aurion-markets.test` client accounts work fine; only a *fresh*
  self-registration through the public `/register` form needs a
  real-looking domain (`example.com` works). Local Supabase (via the
  CLI) does not enforce this the same way, so this only surfaced once
  tested against a real hosted project.

## Access and demo credentials

- Demo credentials (see README) use obviously fictional names/emails
  (`@example.com` / `.test` style) and simple, clearly-labeled demo
  passwords. This is acceptable only because the platform never leaves
  simulation mode; it is not a production credential policy.
