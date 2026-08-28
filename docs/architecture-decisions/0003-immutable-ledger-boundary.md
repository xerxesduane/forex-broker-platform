# ADR 0003: Immutable double-entry ledger as the only source of balance truth

## Status

Accepted (schema now; application logic from Phase 3 onward)

## Context

The brief is explicit and non-negotiable: balances must never be freely
editable numeric fields. This is the single highest-risk area for a
financial platform — an editable `balance` column is a direct path to
silent, unauditable money creation or loss.

## Decision

Every monetary fact is represented as a row in `ledger_entries`,
belonging to a balanced `transactions` group (debits = credits). Entries
are immutable at the database level — no `UPDATE`/`DELETE` grants are
issued on `ledger_entries` to any application role; corrections are new,
linked **compensating entries** referencing the entry they correct.
Wallet "balance" is always a derived read (sum of entry states), never a
stored, directly-written number. Available, pending and reserved amounts
are tracked as separate derived views over entry state, not separate
mutable columns that can drift from each other.

Trading accounts are a deliberate exception in shape, not in principle:
an MT5 trading account's balance/equity/margin fields are a **snapshot of
what MT5 reports**, explicitly named and commented as such in the schema.
They are not a wallet and never feed the ledger directly — money moving
between a wallet and a trading account is itself a ledger-recorded event
in later phases, not a copy operation between two mutable numbers.

External events (deposit webhooks, MT5 sync callbacks) carry an
idempotency key; the `integration_events` table records one row per
inbound/outbound adapter call so a retried webhook cannot double-post.

## Consequences

- Slice 1 does not implement money movement, so this ADR mostly commits
  the *schema shape* (`ledger_entries`, `transactions`, `wallets` as
  foundation tables) rather than working code. This is intentional: the
  boundary must exist before any feature is built against it, so a later
  phase cannot "temporarily" bypass it under deadline pressure.
- Any future PR that adds a mutable `balance` column to `wallets` or
  `trading_accounts` (beyond the documented MT5 snapshot) is a design
  regression against this ADR and should be rejected in review.
- Manual adjustments (future phase) require a reason and, above a
  configurable threshold, dual approval (maker-checker) — enforced at the
  server-action layer, not just the UI.
