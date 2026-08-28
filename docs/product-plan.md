# Aurion Markets — Forex Brokerage Demonstration Platform

Product and delivery plan. Written before implementation, per the working
method requested for this build. This document is the single source of
truth for scope, structure and sequencing; `docs/assumptions.md` and
`docs/architecture-decisions/` hold the supporting decisions.

## 1. Understanding of the product

The brief (`Wealth-Operations-Platform-Build-Plan.docx`) is a capability and
workflow reference for an operations platform: admin control plane +
client self-service portal + immutable ledger + adapter-based external
integrations. This build re-targets that same shape at a **Forex brokerage
and trading-operations** domain, under an original product identity:

- **Product name (demo):** Aurion Markets
- **Positioning:** A regulated-style Forex brokerage's client and
  operations platform — public marketing site, client portal, and
  back-office admin portal, backed by an immutable double-entry ledger and
  a simulated MT5 (MetaTrader 5) provisioning adapter.
- **What it is not:** Not a trading terminal. No charts, order books, or
  live execution — those stay inside MT5. Not a production money-movement
  system at this stage — no real MT5 Manager connection, no real KYC
  document collection, no real payment processing. Every simulated value
  is visibly labeled as demo data.
- **Audience for this stage:** A private, password-protected staging build
  used to demonstrate product direction and operational workflows to a
  prospective client/stakeholder — not end users or real traders.

The source blueprint's "reference admin portal" appendix (a third-party
product audit) is used only as a capability checklist; no code, copy,
layout or asset from that reference is reproduced here. All copy, IA
naming, and visual identity in this repo are original.

## 2. Unresolved business decisions (tracked, not blocking demo build)

These mirror the blueprint's "decisions required before implementation."
For a demo they get a documented placeholder assumption (see
`docs/assumptions.md`) rather than blocking work; a real launch requires
named owners and legal/compliance sign-off.

1. Operating jurisdiction(s) and regulated-activity boundaries.
2. Final brand name, supported languages, currencies, initial markets.
3. Real vs. demo account types, MT5 server topology, credential-delivery
   policy for a production integration.
4. Deposit/withdrawal providers, supported rails, fees, approval
   thresholds.
5. KYC provider, required document sets, retention policy.
6. Referral/commission/rebate/ranking business rules.
7. Hosting provider, data region, availability/recovery targets.

## 3. Phased implementation plan

This build follows the blueprint's phase shape but is scoped to what a
demo needs. Phases after 1 are **not** built in this pass — see
"Stopping point" below.

| Phase | Focus | Demo-stage output |
|---|---|---|
| 0 | Discovery & foundation | This plan, ADRs, repo scaffold, domain schema, RBAC/audit skeleton |
| 1 | Vertical slice | Registration → KYC → demo MT5 account, client + admin views, seed data |
| 2 | Identity & KYC breadth | Full 2FA enforcement, session/device management, richer KYC review tooling |
| 3 | Accounts, wallets & ledger | Real-account requests, wallets, ledger UI, transaction history |
| 4 | Deposits & withdrawals | Simulated payment adapter, approvals, reconciliation queue |
| 5 | Growth & service | Referrals, commissions, rebates, rankings, support tickets |
| 6 | Hardening | Broader Playwright coverage, accessibility pass, perf, security review |

**This engagement builds Phase 0 and Phase 1 only**, then stops for review,
per the instruction not to implement the whole platform in one pass.

## 4. Repository structure (proposed and applied)

```
forex-broker-platform/
├── docs/
│   ├── product-plan.md                 # this file
│   ├── assumptions.md
│   ├── architecture-decisions/         # ADRs, one file per decision
│   └── testing/                        # test reports, screenshots
├── supabase/
│   ├── migrations/                     # versioned SQL, applied in order
│   └── seed/                           # deterministic seed + reset scripts
├── e2e/                                # Playwright critical-journey specs
├── src/
│   ├── app/
│   │   ├── (public)/                   # marketing site — homepage, IB, legal, etc.
│   │   ├── (auth)/                     # register, login, verify-email
│   │   ├── portal/                     # client portal (authenticated, role=client)
│   │   └── admin/                      # admin portal (authenticated, staff roles)
│   ├── components/
│   │   ├── ui/                         # shadcn/ui primitives
│   │   ├── public/                     # marketing site components
│   │   ├── portal/                     # client portal components
│   │   └── admin/                      # admin portal components
│   ├── domain/                         # framework-free business logic
│   │   ├── kyc/                        # KYC case state machine + rules
│   │   ├── trading-account/            # account request/provisioning rules
│   │   ├── ledger/                     # double-entry primitives (schema for later phases)
│   │   └── rbac/                       # permission catalogue + checks
│   ├── lib/
│   │   ├── supabase/                   # server/browser client factories
│   │   ├── adapters/                   # MT5, KYC, payments, email, SMS, documents
│   │   ├── audit/                      # audit-event writer
│   │   └── validation/                 # shared Zod schemas
│   └── server/                         # server actions (mutations) per domain
├── proxy.ts                            # Next.js 16 route-protection boundary
├── CLAUDE.md
└── README.md
```

## 5. Domain boundaries

Mirrors the blueprint's data-ownership rules, translated to Forex terms:

- **Identity** — auth users, client profiles, staff accounts, sessions.
  Owns who someone is; does not own money or KYC decisions.
- **Compliance** — KYC cases, KYC documents (metadata; files live in
  private storage), decisions, reviewers, retention flags.
- **Trading** — trading-account requests, MT5 identifiers, account
  snapshots. Does not own wallet balances — a trading account's
  balance/equity/margin fields are a *snapshot* synced from the MT5
  adapter, not a source of ledger truth.
- **Finance** — wallets, ledger accounts, ledger entries, deposits,
  withdrawals, internal transfers, reconciliation state. Phase 3+.
- **Growth** — referral relationships, IB structure, commissions,
  rebates, ranks. Phase 5+.
- **Operations** — support tickets, notifications, staff roles and
  permissions, integration status, site/email settings.
- **Audit** — append-only, receives evidence from every other domain;
  every domain writes to it, nothing reads it back for business logic.

Cross-domain rule carried from the blueprint: **trading never mutates a
balance directly.** Even though wallets/ledger are Phase 3+, the schema
for demo trading accounts already stores balance/equity/margin fields as
an explicit **MT5 snapshot**, not a wallet, so the ledger boundary is
never crossed later by convenience.

## 6. Initial database entity map

Full domain vocabulary from the brief, as tables. Tables marked
**(slice 1)** are functionally wired in this pass; the rest are created
now (so the schema is coherent and future phases are additive, not
migratory) but have no application logic yet — they are foundation, not
feature.

```
auth.users (Supabase-managed)
  └─ profiles (slice 1)                 1:1 with auth.users
       ├─ role: 'client' | staff roles
       └─ kyc_status (denormalized projection of latest kyc_cases row)

roles (slice 1)                         staff role catalogue (seeded)
permissions (slice 1)                   atomic permission catalogue (seeded)
role_permissions (slice 1)              join table
staff_role_assignments (slice 1)        profile_id -> role_id

kyc_cases (slice 1)                     client_id, status, analyst_id, reason, timestamps
kyc_documents (slice 1)                 kyc_case_id, doc_type, storage_path, status

trading_accounts (slice 1)              client_id, account_type(demo|real), platform,
                                         mt5_login, mt5_server, mt5_group, base_currency,
                                         leverage, spread_model, commission_model,
                                         swap_settings, status, balance/equity/credit/
                                         used_margin/free_margin/margin_level (MT5 snapshot,
                                         not ledger-derived), requested_at, provisioned_at

wallets                                 client_id, currency, available/pending/reserved
ledger_accounts                         chart-of-accounts style ledger account per wallet/entity
ledger_entries                          immutable; debit/credit; linked compensating_entry_id
transactions                            groups balanced ledger_entries; external_ref, idempotency_key
deposits                                transaction_id, method, provider_ref, status
withdrawals                             transaction_id, method, provider_ref, status, approvals
internal_transfers                      transaction_id, from_wallet, to_wallet

referral_relationships                  referrer_id, referee_id, ib_id
introducing_brokers                     profile_id, tier/rank
commissions                             ib_id, source_transaction_id, amount, status
rebates                                 client_id, source_transaction_id, amount, status
ranks                                   name, thresholds, benefits

support_tickets                         client_id, subject, status, priority
support_ticket_messages                 ticket_id, author_id, body

notifications (slice 1, minimal)        profile_id, type, payload, read_at

audit_events (slice 1)                  actor_id, actor_role, action, entity_type, entity_id,
                                         reason, correlation_id, before, after, created_at
integration_events (slice 1)            adapter, event_type, request/response (typed), 
                                         idempotency_key, status — one row per adapter call
```

Full column-level definitions live in the SQL migrations under
`supabase/migrations/`, which are the authoritative entity map going
forward (this section is a map for review, not a substitute for the DDL).

## 7. First vertical slice — definition of done

End-to-end journey (client + admin sides), matching the brief exactly:

1. Client registers (email + password via Supabase Auth).
2. Client signs in.
3. Client completes a fictional profile (name, DOB, country, address,
   phone — clearly a demo profile, no real-data collection).
4. Client submits a simulated KYC application (form + placeholder
   document upload through the simulated document-storage adapter).
5. A KYC analyst (seeded staff account) reviews the case in the admin
   portal and approves it, with a reason recorded.
6. Client requests a demo MT5 trading account.
7. The simulated MT5 adapter "provisions" the account synchronously
   (demo accounts do not require ops approval, matching real-broker
   behavior) and returns a simulated login/server/group.
8. Client sees the new account on their dashboard, clearly labeled demo.
9. An administrator opens the client's record and sees a complete
   timeline: registration → profile → KYC submitted → KYC approved →
   account requested → account provisioned, each entry backed by an
   `audit_events` row with actor, reason and correlation ID.

Out of scope for this slice (present as scaffolding/IA only, not
functional): real trading accounts, wallets/deposits/withdrawals,
referrals/commissions, support tickets, staff role management UI,
site/email settings. These are stubbed as "coming soon" admin nav items
so the information architecture from the brief is visibly complete.

## 8. Stopping point

Per the working method: this pass delivers Phase 0 (foundation) and
Phase 1 (the vertical slice above), verified by `next build`, `eslint`,
and Vitest unit tests that run in this environment, plus a Playwright
spec for the critical journey (its live run requires a local Supabase
stack — see `docs/testing/vertical-slice-report.md` for exactly what was
and wasn't executed). Phases 2–6 are proposed next milestones, not built
here.
