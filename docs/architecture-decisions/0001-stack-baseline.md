# ADR 0001: Technology baseline

## Status

Accepted

## Context

The engagement specifies a technology baseline unless the repository
justifies an alternative. The repository was empty, so there is no
existing stack to weigh against it.

## Decision

Adopt the specified baseline as-is: Next.js (App Router) on Next.js 16,
React 19, TypeScript (strict), Tailwind CSS v4, shadcn/ui, PostgreSQL via
Supabase (database + auth), Zod for validation, React Hook Form for forms,
Vitest for unit/integration tests, Playwright for critical browser
journeys, Vercel-compatible deployment output.

Next.js 16 was current at scaffold time and ships with breaking changes
versus the Next.js 13–15 era most training data reflects: fully async
`cookies()`/`headers()`/`params`/`searchParams`, `middleware.ts` renamed
to `proxy.ts` (exported function `proxy`, Node runtime only), `next lint`
removed in favor of the standalone ESLint CLI, and Turbopack on by
default. The project follows the Next.js 16 conventions throughout —
see `node_modules/next/dist/docs/` for the authoritative reference during
future work, per the note in `AGENTS.md`.

## Consequences

- Server code must `await` `cookies()` — this affects every Supabase
  server client construction.
- Route protection lives in `proxy.ts`, not `middleware.ts`.
- `npm run lint` runs ESLint directly; it is not part of `next build`.
- Zod 4 is in use (not 3) — prefer top-level helpers (`z.email()`) over
  the deprecated chained forms where both exist, though the chained forms
  still work.
