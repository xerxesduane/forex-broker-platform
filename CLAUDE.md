@AGENTS.md

# Aurion Markets — engineering instructions

Demo Forex brokerage platform (public site + client portal + admin
portal). See `docs/product-plan.md` for scope, `docs/assumptions.md` for
working assumptions, and `docs/architecture-decisions/` for the "why"
behind the rules below.

## Non-negotiables

1. **Never add a mutable `balance` column.** All money is derived from
   `ledger_entries` (immutable, balanced debit/credit rows) per ADR 0003.
   A trading account's balance/equity/margin fields are an MT5
   **snapshot**, explicitly commented as such — never a wallet.
2. **Every server-side mutation of a sensitive resource calls
   `requirePermission(...)` from `src/lib/rbac`** before touching data.
   Hiding a button in the UI is never sufficient authorization (ADR
   0004). RLS is enabled and default-deny on every table — a new table
   needs an explicit policy before it's usable, not "add later."
3. **Every sensitive read/write writes an audit event** via
   `src/lib/audit`. Include actor, reason (when the action is a decision,
   e.g. KYC approve/reject), entity type/id, and correlation id.
4. **Adapters only.** Code outside `src/lib/adapters/*` must depend on an
   adapter's typed interface (e.g. `MT5Adapter`), never a vendor payload
   shape. This build only ships `simulation` implementations —
   `INTEGRATIONS_MODE` must stay `simulation` unless a human explicitly
   approves and implements a reviewed `live` adapter (ADR 0005). Never
   place real MT5 Manager or other vendor credentials in code reachable
   from the browser.
5. **Label every simulated value.** Demo balances, MT5 accounts, KYC
   decisions, and provider responses must be visibly marked as demo data
   in the UI (badge/copy), not just in a code comment.
6. **This platform is not the trading terminal.** No order execution,
   charts, or live positions — those stay in MT5 (out of scope by
   design, not an oversight).

## Next.js 16 specifics (this repo, not the Next.js you may remember)

- `cookies()`, `headers()`, `params`, `searchParams` are **async** —
  always `await` them, including inside the Supabase server client
  factory.
- Route protection lives in `proxy.ts` (function `proxy`), not
  `middleware.ts`.
- `next lint` was removed. Use `npm run lint` (ESLint CLI directly).
- Consult `node_modules/next/dist/docs/` before assuming an API from
  training data still works the same way.

## Stack conventions

- TypeScript strict mode; no `any` without a comment explaining why.
- Zod 4 for all external input (forms, server action args, adapter
  payloads) — validate at the boundary, trust internal types elsewhere.
- React Hook Form + `@hookform/resolvers/zod` for every form.
- shadcn/ui primitives in `src/components/ui`; compose, don't fork them.
- Domain logic (`src/domain/*`) stays framework-free — no Next.js,
  Supabase, or React imports there, so it's testable with plain Vitest
  and portable if a domain is ever extracted (ADR 0002).
- Prefer Server Components + Server Actions; reach for a client
  component only for interactivity (forms, dialogs, live-updating
  widgets).

## Testing expectations

- New domain logic (state machines, validation, RBAC checks, adapters)
  gets a Vitest unit test that runs without a live database.
- A change to the primary demo journey (register → KYC → demo account)
  should keep `e2e/vertical-slice.spec.ts` accurate; it requires a local
  Supabase stack (`supabase start`, needs Docker) to actually run — see
  `docs/testing/vertical-slice-report.md`.
- Before claiming a change works: `npm run typecheck && npm run lint &&
  npm test && npm run build`. Don't report success without running
  these.

## Demo data

- Seed data (`supabase/seed/seed.ts`) must use obviously fictional
  identities. Never copy real personal information, even as a
  placeholder.
- `npm run db:reset-demo` must remain safe to run repeatedly and require
  `ALLOW_DEMO_DATA_RESET=true` — it is destructive by design (wipes and
  reseeds demo data) and must never run against a non-demo database.
