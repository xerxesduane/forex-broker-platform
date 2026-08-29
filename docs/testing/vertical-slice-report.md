# Vertical slice — testing report

Honest account of what has been verified, updated after the project was
connected to a real hosted Supabase project and deployed to Vercel (see
`docs/assumptions.md` "Environments"). This supersedes the original
version of this report, written when nothing had run against a live
database — that gap is now substantially closed.

## Live environment

- **App:** https://forex-broker-platform.vercel.app (Vercel, auto-deploys
  from `main` on the `xerxesduane/forex-broker-platform` GitHub repo)
- **Database:** hosted Supabase project `aurion-markets-demo`
  (`mkjxivzsoayvspsdyzuj`, org `Xerxes`), all 10 migrations applied
- **Data:** seeded via `npm run db:seed` — 5 staff, 5 clients across
  every KYC state, 1 active demo trading account, ledger examples,
  referrals/commissions/rebates, support tickets (see README for the
  credential table)

## What was verified, and how

### Build-time checks (unchanged from before, still green)

| Check               | Result                                   |
| ------------------- | ---------------------------------------- |
| `npm run typecheck` | Pass, 0 errors                           |
| `npm run lint`      | Pass, 0 errors, 5 informational warnings |
| `npm test`          | Pass, 166/166 unit tests                 |
| `npm run build`     | Pass, correct static/dynamic route split |

> Updated after the full-platform build. The unit suite grew from 32 to
> 166 as the domain layer expanded: money arithmetic, double-entry posting
> builders, the deposit/withdrawal state machines and the maker-checker
> rule, ticket transitions, commission and rank calculation, TOTP against
> the RFC 4226/6238 test vectors, and a QR encoder verified by decoding
> its own output. The remaining lint warnings are React Compiler notices
> about React Hook Form's `watch()`, which is a known incompatible-library
> pattern rather than a defect.

### Live checks against the hosted database (new)

All of the following were run for real against `aurion-markets-demo`,
not reasoned through — via the Supabase Management/MCP tooling and
direct `curl` calls to the project's REST/Auth APIs:

- **Migrations**: all 10 files applied without error (`apply_migration`
  per file). `list_tables` confirms 24 tables, RLS enabled on every one.
- **Security advisors**: ran `get_advisors` (security) after applying
  the schema — it caught two real issues (a function with a mutable
  `search_path`, and two trigger-only functions unnecessarily exposed as
  public RPC endpoints). Fixed in
  `supabase/migrations/00000000000010_security_hardening.sql`, then
  re-ran advisors to confirm both cleared. The two remaining warnings
  (`has_permission`/`is_staff` callable by `authenticated`) are the
  intended design — that's how `src/lib/rbac/require-permission.ts`
  calls them — not a gap.
- **Seed script**: `npm run db:seed` ran end-to-end against the hosted
  project with zero errors — `auth.admin.createUser`, profile updates,
  KYC case state transitions, double-entry ledger postings, referrals,
  commissions, support tickets. Row counts after seeding matched
  expectations exactly across all 24 tables.
- **Auth**: signed in as a seeded client (`samuel.reyes@...`) via the
  real Supabase Auth REST API — succeeded, returned a valid access token.
- **RLS, client scope**: using that token, queried `profiles` and
  `trading_accounts` — got back exactly that client's own row (name,
  KYC status, the seeded demo account with its real MT5 login and
  $10,000 balance), nothing else.
- **RLS + RBAC, staff scope**: signed in as the seeded KYC analyst,
  confirmed `has_permission('kyc.decide')` returns `true` and
  `has_permission('withdrawal.approve')` returns `false` (deny-by-default
  working correctly — that permission was never granted to the
  `kyc_analyst` role), and that the analyst's view of `kyc_cases` returns
  exactly the 4 seeded cases with correct statuses.
- **App server**: local `next dev` and the live Vercel deployment both
  correctly redirect signed-out visitors from `/portal` and `/admin` to
  `/login?next=...` (was a 500 before real credentials existed; now a
  clean 307).
- **Discovered and fixed**: hosted Supabase Auth rejects the `.test` TLD
  on public self-registration (`email_address_invalid`) — found by
  actually probing the signup endpoint. Fixed the Playwright spec's
  throwaway test email to use `example.com` instead; documented in
  `docs/assumptions.md`. This does not affect the seeded accounts (created
  via the Admin API, which isn't subject to this check) or real users
  registering with real email addresses.

## What is still not verified

1. **The click-through UI journey in a real browser.** Every piece it
   depends on (RLS, RBAC, auth, data shape) has now been verified
   independently via direct API calls, but no one has actually clicked
   through the 9-step journey in Chrome/Playwright against this project.
2. **`e2e/vertical-slice.spec.ts` has still not been executed.** Running
   it needs either: (a) email confirmation disabled on the hosted project
   (Authentication → Providers → Email → "Confirm email" off in the
   Supabase dashboard — mirrors what `supabase/config.toml` already does
   for local dev), since a fresh registration otherwise can't complete
   without clicking a real confirmation email, or (b) pointing it at a
   local Supabase stack once Docker is available. Once either is true,
   `npm run test:e2e` should run cleanly — everything it depends on has
   been independently confirmed to work.
3. **`supabase/seed/reset.ts`** was written and reasoned through
   carefully (FK-dependency-ordered deletes) but not yet executed for
   real. Low risk given how well the seed script itself performed, but
   still unverified.
4. **Document upload → Supabase Storage** (the `kyc-documents` bucket
   and its RLS policies) has schema-level confirmation (bucket exists,
   policies applied) but no file has actually been uploaded through it.

## Conclusion

This is a materially stronger position than the original report: the
schema, RLS, RBAC, auth, and seed data are now confirmed correct against
a real, live Postgres/Auth backend, not just self-consistent code. What
remains is specifically the real-browser UI walkthrough and the
Playwright run, both blocked only by the email-confirmation setting
noted above — not by any newly-discovered defect in the application
logic itself.
