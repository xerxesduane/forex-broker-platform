# Vertical slice — testing report

Honest account of what was verified while building this project, and
what still needs to be run locally. Per the working method for this
engagement: do not claim completion beyond what was actually checked.

## Environment this was built in

The sandbox used to build this project had **no Docker and no local
Postgres/Supabase CLI runtime available** (only `npx supabase` for
non-Docker subcommands like `init`/`typegen` worked; `supabase start`
requires Docker). This is a real, material limitation:

- The database schema (`supabase/migrations/`) was written carefully
  against Postgres/PostgREST semantics and cross-checked column-by-column
  against every query in the application code, but **the migrations have
  not been applied to a live database and the SQL has not been executed**.
- The application was never run against a live Supabase instance
  (`next dev` was not started with real `NEXT_PUBLIC_SUPABASE_URL` /
  keys), so no page was ever rendered in a browser and no server action
  ever executed against real data.
- The Playwright spec (`e2e/vertical-slice.spec.ts`) was written to
  exercise the full 9-step journey but **was not executed**. Selectors
  were chosen by reading the actual component markup (label text, button
  text, `id` attributes), but Base UI's exact ARIA roles for `Select`
  items and `AlertDialog` were not confirmed by running a real browser
  against the app — see "Known risk" below.
- No screenshots are included, because no live UI was ever rendered here.

## What was actually verified, and how

| Check | Command | Result |
|---|---|---|
| TypeScript, strict mode | `npm run typecheck` | **Pass**, 0 errors |
| ESLint | `npm run lint` | **Pass**, 0 errors, 4 informational warnings (React Compiler noting `react-hook-form`'s `watch()` can't be memoized — expected, not a bug) |
| Unit tests | `npm test` | **Pass**, 32/32 tests across 7 files (see below) |
| Production build | `npm run build` | **Pass** — Next.js 16 / Turbopack build completes; route manifest confirms `/portal/*` and `/admin/*` are correctly dynamic (`ƒ`), public marketing pages are static (`○`), legal docs are SSG (`●`) |

### Unit test coverage (DB-independent, all passing)

- `src/domain/kyc/state-machine.test.ts` — every legal/illegal KYC
  transition, including that a terminal state can't be re-entered and
  that reject/revision require a reason.
- `src/domain/trading-account/state-machine.test.ts` — request →
  provisioning → active/rejected, suspend/reactivate, and that a
  closed/active account refuses invalid transitions.
- `src/domain/profile/schema.test.ts` — a valid fictional profile passes;
  under-18, missing name, malformed phone all fail.
- `src/domain/trading-account/schema.test.ts` — valid demo request
  passes; disallowed leverage and an unchecked declaration fail.
- `src/lib/adapters/mt5/simulated.test.ts` — provisioning returns a
  clearly-fake login prefix, records exactly one `integration_events`
  call, and a fresh snapshot has zero margin usage.
- `src/lib/adapters/shared/resilience.test.ts` — `withTimeout` resolves
  normally and times out correctly; `withRetry` retries only retryable
  errors, stops at `maxAttempts`, and stops early on success.
- `src/lib/adapters/shared/webhook.test.ts` — signature verification
  accepts a correctly-signed payload and rejects a wrong secret, a
  tampered body, and a missing signature/secret.

These were chosen deliberately as the highest-value, DB-independent
checks: the financial-integrity state machines, the input boundary
(Zod schemas), and the adapter contract (ADR 0005) are exactly the pieces
where a silent bug would be expensive later.

## What still needs to run locally before this counts as end-to-end verified

1. `npm run supabase:start` (needs Docker) — confirms every migration in
   `supabase/migrations/` applies cleanly in order, RLS policies compile,
   and the `kyc-documents` storage bucket/policies are created.
2. `npm run db:seed` — confirms the seed script's assumptions about
   Supabase's Admin API (`auth.admin.createUser`) and the foreign-key
   ordering in `supabase/seed/reset.ts` are correct against a real
   database, not just reasoned through.
3. `npm run dev` + manually walk the 9-step journey (steps are listed in
   README.md "Running the vertical slice") — confirms every Server
   Action, RLS policy and UI state actually behaves as designed.
4. `npm run test:e2e` — runs `e2e/vertical-slice.spec.ts` against the app
   from step 3.

## Known risk in the untested Playwright spec

The spec assumes shadcn's `Select` items render with `role="option"` and
`AlertDialog` renders `role="alertdialog"` — standard for an
ARIA-compliant library (this project's shadcn/ui uses Base UI primitives,
which target full ARIA compliance), but **not confirmed against a real
browser here**. If the first local run fails on a `getByRole` call, that
selector is the most likely culprit, not the underlying feature.

## Conclusion

The codebase is internally consistent, passes every check that doesn't
require a live database, and produces a clean production build. The
journey logic was designed and cross-checked carefully, but has not been
exercised end-to-end — that is real remaining verification work, not a
formality, and it is called out explicitly here rather than glossed over.
