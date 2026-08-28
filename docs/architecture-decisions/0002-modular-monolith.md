# ADR 0002: Modular monolith, not microservices

## Status

Accepted

## Context

The brief explicitly asks for a modular monolith and warns against
introducing microservices unnecessarily. A demo-stage brokerage platform
has no scale or team-boundary pressure that would justify distributed
services, and splitting services would multiply the operational surface
(deployment, auth propagation, observability) without a corresponding
benefit at this stage.

## Decision

One deployable Next.js application. Domain separation is enforced at the
**module boundary in code**, not at the network boundary:

- `src/domain/*` holds framework-free business rules per domain (KYC,
  trading-account, RBAC; ledger primitives are scaffolded for later
  phases). These modules do not import Next.js, Supabase, or React.
- `src/server/*` holds Server Actions per domain, the only place domain
  logic is invoked from the web layer.
- `src/lib/adapters/*` holds the only code allowed to know about external
  integration shapes (MT5, KYC vendor, payments, email, SMS, documents).
  The rest of the app depends on the adapter's typed interface, never a
  vendor payload.
- Cross-domain access goes through explicit function calls / repository
  interfaces, not shared mutable state or reaching into another domain's
  tables directly from UI code.

This keeps a clean extraction path (per the source blueprint's own
architecture principle) without paying distributed-systems cost now.

## Consequences

- A future extraction (e.g. pulling Finance into its own service) means
  moving a `src/domain/finance` + `src/server/finance` + its migrations
  behind an API boundary — the module boundary already matches a future
  service boundary.
- Code review should flag any UI component or route handler importing
  directly from another domain's Supabase table names instead of going
  through that domain's server actions/queries.
