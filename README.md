# Aurion Markets — Forex Brokerage Demonstration Platform

A private demonstration platform for a Forex brokerage: a public marketing
site, a guided client portal, and a queue-oriented admin console, backed by
an immutable double-entry ledger and simulated external integrations (MT5,
KYC provider, payments, email, SMS, document storage).

Working end to end: registration, identity verification, wallet funding,
withdrawals with maker-checker approval, internal transfers, demo and live
MT5 account provisioning, an Introducing Broker programme with commissions
and rebates, support ticketing, staff and role administration, platform
settings that genuinely drive behaviour, reporting, and an audit trail the
database itself refuses to rewrite.

**This is a demo, not a production system.** No real money, no real
identity documents, no production MT5 connection — every integration runs
in `simulation` mode and every simulated value is visibly labeled as demo
data in the UI. See `docs/product-plan.md` for scope and
`docs/assumptions.md` for the working assumptions behind this build.

## Live demo

**https://forex-broker-platform.vercel.app** — deployed on Vercel,
backed by a real hosted Supabase project (`aurion-markets-demo`), seeded
with the demo accounts below. Auto-deploys on every push to `main`.

**Showing this to someone? Start with
[`docs/demo/walkthrough.md`](docs/demo/walkthrough.md)** — a 15-minute
script (with a 5-minute version), the full credential list, and a precise
statement of what is simulated and what is not.

`docs/testing/vertical-slice-report.md` records what has been verified
live against this deployment versus what still needs a real-browser run.

## Stack

Next.js 16 (App Router) · React 19 · TypeScript (strict) · Tailwind CSS v4
· shadcn/ui (Base UI primitives) · Supabase (Postgres + Auth + Storage) ·
Zod · React Hook Form · Vitest · Playwright.

## Prerequisites

- Node.js 20.9+ (this project was built with Node 24)
- Either [Docker](https://www.docker.com/) (to run Supabase fully locally via `supabase start`) **or** a free hosted Supabase project (no Docker needed — see below)
- [Supabase CLI](https://supabase.com/docs/guides/cli) (invoked here via `npx supabase`, no global install needed)

## Local setup

```bash
npm install
cp .env.example .env.local
```

**No Docker available?** Create a free project at
[supabase.com/dashboard](https://supabase.com/dashboard/new), then:

```bash
npx supabase login   # or set SUPABASE_ACCESS_TOKEN
npx supabase link --project-ref <your-project-ref>
npx supabase db push   # applies every file in supabase/migrations/
```

Copy the project's URL/anon key/service_role key (Settings → API Keys)
into `.env.local`, then skip to `npm run db:seed` below. This is exactly
how the live demo's database (`aurion-markets-demo`) was set up.

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

### Always create accounts through the Auth API, never with SQL

`supabase/seed/seed.ts` creates every account with
`auth.admin.createUser()`. That is deliberate, and worth knowing if you
are ever tempted to insert into `auth.users` directly to save a round
trip.

Four columns on `auth.users` — `confirmation_token`, `recovery_token`,
`email_change_token_new` and `email_change` — have no database default.
A hand-written INSERT leaves them `NULL`, and GoTrue reads them into
non-nullable Go strings, so the row fails to scan. The user looks
perfectly correct in SQL (the bcrypt hash even verifies with
`crypt()`), but every sign-in returns a flat _"Invalid login
credentials"_ with no hint as to why.

If you inherit a database in that state, the repair is:

```sql
update auth.users
set confirmation_token         = coalesce(confirmation_token, ''),
    recovery_token             = coalesce(recovery_token, ''),
    email_change_token_new     = coalesce(email_change_token_new, ''),
    email_change               = coalesce(email_change, ''),
    email_change_token_current = coalesce(email_change_token_current, ''),
    phone_change               = coalesce(phone_change, ''),
    phone_change_token         = coalesce(phone_change_token, ''),
    reauthentication_token     = coalesce(reauthentication_token, '');
```

## Demo credentials

Password for every seeded account: `AurionDemo!2026`

Staff sign in at `/login` and land in `/admin`; clients land in `/portal`.
Each staff role sees a different console, because the navigation and the
actions are driven by the same permission checks the server enforces.

### Staff

| Role                | Email                                    | Sees                                             |
| ------------------- | ---------------------------------------- | ------------------------------------------------ |
| Super administrator | `ava.morgan@aurion-markets.example`      | Everything                                       |
| KYC analyst         | `noah.whitfield@aurion-markets.example`  | Verification queue only — no money, no settings  |
| Finance operator    | `priya.desai@aurion-markets.example`     | Money movement, read and prepare; cannot approve |
| Head of finance     | `marcus.oyelaran@aurion-markets.example` | Approves money movement, posts adjustments       |
| Finance approver    | `yuki.tanaka@aurion-markets.example`     | The second signature on a large withdrawal       |
| Support agent       | `lena.brooks@aurion-markets.example`     | Tickets and client context only                  |
| Trading operations  | `tomas.iversen@aurion-markets.example`   | Account provisioning and lifecycle               |
| Partnerships        | `sofia.marchetti@aurion-markets.example` | Partners, commissions, rebates                   |
| Administrator       | `rachel.okonkwo@aurion-markets.example`  | Staff, roles, settings, integrations             |
| Auditor             | `henry.laurent@aurion-markets.example`   | Read-only across everything                      |

### Clients

| State                                       | Email                                       |
| ------------------------------------------- | ------------------------------------------- |
| Verified and funded — the fullest picture   | `samuel.reyes@demo.aurion-markets.test`     |
| Large withdrawal held for a second approver | `aisha.rahman@demo.aurion-markets.test`     |
| Active Introducing Broker with a downline   | `imogen.hale@demo.aurion-markets.test`      |
| Verification sent back for more information | `grace.oyelowo@demo.aurion-markets.test`    |
| Restricted account — funding blocked        | `viktor.ostrovsky@demo.aurion-markets.test` |
| Verification in review                      | `priti.nakamura@demo.aurion-markets.test`   |
| Verification rejected                       | `daniel.kowalski@demo.aurion-markets.test`  |
| Brand new, nothing started                  | `jordan.ellery@demo.aurion-markets.test`    |

## Running the core journey manually

The full script, including money movement and the maker-checker control,
is in [`docs/demo/walkthrough.md`](docs/demo/walkthrough.md). The original
onboarding slice, still accurate:

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
