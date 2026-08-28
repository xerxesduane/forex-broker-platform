# Aurion Markets — Forex Brokerage Demonstration Platform

A private demonstration platform for a Forex brokerage: a public marketing
site, a guided client portal, and a queue-oriented admin portal, backed by
an immutable double-entry ledger foundation and simulated external
integrations (MT5, KYC provider, payments, email, SMS, document storage).

**This is a demo, not a production system.** No real money, no real
identity documents, no production MT5 connection — every integration runs
in `simulation` mode and every simulated value is visibly labeled as demo
data in the UI. See `docs/product-plan.md` for scope and
`docs/assumptions.md` for the working assumptions behind this build.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4
· shadcn/ui (Base UI primitives) · Supabase (Postgres + Auth + Storage) ·
Zod · React Hook Form · Vitest · Playwright.

## Prerequisites

- Node.js 20.9+ (this project was built with Node 24)
- [Docker](https://www.docker.com/) — required by the Supabase CLI's local stack
- [Supabase CLI](https://supabase.com/docs/guides/cli) (invoked here via `npx supabase`, no global install needed)

## Local setup

```bash
npm install
cp .env.example .env.local
```

Start the local Supabase stack (Postgres, Auth, Storage, Studio) — this
applies every migration in `supabase/migrations/` automatically:

```bash
npm run supabase:start
```

The command prints an API URL, `anon key` and `service_role key`. Copy
those into `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL="http://127.0.0.1:54321"
NEXT_PUBLIC_SUPABASE_ANON_KEY="<anon key from supabase start>"
SUPABASE_SERVICE_ROLE_KEY="<service_role key from supabase start>"
ALLOW_DEMO_DATA_RESET="true"
```

Seed deterministic demo data (staff accounts, demo clients in different
KYC states, a provisioned demo MT5 account, ledger examples, referrals,
support tickets):

```bash
npm run db:seed
```

Run the app:

```bash
npm run dev
```

Open http://localhost:3000.

### Resetting demo data

`npm run db:reset-demo` wipes every row the seed process can create (and,
because this database only ever holds demo data, everything else too —
see `supabase/seed/reset.ts` for exactly what it deletes and in what
order) and reseeds. It refuses to run unless `ALLOW_DEMO_DATA_RESET=true`
is set in `.env.local`, so it can't fire by accident.

## Demo credentials

Password for every seeded account: `AurionDemo!2026`

| Role | Email |
|---|---|
| Super administrator | `ava.morgan@aurion-markets.example` |
| KYC analyst | `noah.whitfield@aurion-markets.example` |
| Finance operator | `priya.desai@aurion-markets.example` |
| Finance approver | `marcus.oyelaran@aurion-markets.example` |
| Support agent | `lena.brooks@aurion-markets.example` |
| Client — not started | `jordan.ellery@demo.aurion-markets.test` |
| Client — KYC in review | `priti.nakamura@demo.aurion-markets.test` |
| Client — KYC approved, has a demo account | `samuel.reyes@demo.aurion-markets.test` |
| Client — KYC approved, has a "real" account request | `imogen.hale@demo.aurion-markets.test` |
| Client — KYC rejected | `daniel.kowalski@demo.aurion-markets.test` |

Staff sign in at `/login` and land in `/admin`; clients land in `/portal`.

## Running the vertical slice manually

1. Visit `/register`, sign up with a fresh email (local Supabase has email
   confirmation disabled, so you're taken straight to sign-in).
2. Sign in, complete your profile at `/portal/profile`.
3. Submit KYC at `/portal/kyc` (any small file works as the "document").
4. Sign out, sign in as the KYC analyst (`noah.whitfield@...`), open
   `/admin/kyc`, open the case, approve it.
5. Sign out, sign back in as the client. `/portal/kyc` now shows
   "Verified" — request a demo account from `/portal/accounts`. It
   provisions instantly (simulated MT5 adapter) and you land on the
   account detail page showing a $10,000.00 simulated balance.
6. Sign in as the super admin, open `/admin/clients`, open the client —
   the full timeline (profile → KYC submit → KYC decide → account
   request → account provisioned) is there with actor, reason and
   correlation ID for each step.

## Testing

```bash
npm run typecheck   # tsc --noEmit
npm run lint         # eslint
npm test             # vitest — domain logic, adapters, schemas (no DB needed)
npm run build        # next build
npm run test:e2e      # playwright — requires the steps above (Supabase running + seeded) and `npm run dev` in another terminal, or let Playwright start it for you
```

See `docs/testing/vertical-slice-report.md` for exactly what was verified
while building this project (this sandbox had no Docker, so the
Supabase-dependent checks — `next dev` against a live database and the
Playwright run — could not be executed here and are flagged accordingly).

## Project structure

See `docs/product-plan.md` section 4 for the full repository map and
section 6 for the database entity map. In short:

- `src/domain/*` — framework-free business rules (state machines, Zod schemas, RBAC catalogue)
- `src/lib/adapters/*` — typed integration interfaces + simulated implementations (ADR 0005)
- `src/lib/supabase/*`, `src/lib/rbac/*`, `src/lib/audit/*` — Supabase clients, permission checks, audit writer
- `src/server/*` — Server Actions (the only place domain logic is invoked from the web layer)
- `src/app/(public)`, `src/app/portal`, `src/app/admin` — the three experiences
- `supabase/migrations/*` — versioned SQL, the authoritative schema/RLS source of truth
- `supabase/seed/*` — deterministic seed + reset scripts
- `e2e/` — Playwright critical-journey spec

## Engineering ground rules

See `CLAUDE.md` (financial-integrity, RBAC and adapter rules that apply
to any future change) and `docs/architecture-decisions/` for the
reasoning behind them.
