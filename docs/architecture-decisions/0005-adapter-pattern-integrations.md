# ADR 0005: Vendor-agnostic adapters with a simulation mode

## Status

Accepted

## Context

MT5, KYC, payments, email, SMS and document storage are all external
integrations that must not leak vendor-specific payload shapes into the
UI or domain layer, must support idempotency, and must be safely
simulated for a demo that cannot use production credentials.

## Decision

Each integration is a TypeScript interface in `src/lib/adapters/<name>/types.ts`
describing typed requests/responses in Aurion Markets' own vocabulary
(e.g. `ProvisionDemoAccountRequest`, not a raw MT5 Manager API shape).
Every adapter call:

- takes an idempotency key,
- returns a discriminated-union result (`{ ok: true, data }` or
  `{ ok: false, error: { code, message, retryable } }`) instead of
  throwing for expected failure modes,
- writes one row to `integration_events` (adapter name, event type,
  request/response summary, idempotency key, status) for audit and
  reconciliation,
- is swappable behind a factory that reads `INTEGRATIONS_MODE`. Only
  `simulation` is implemented in this build; a `live` implementation is a
  future, separately-reviewed change and is not scaffolded with dead code
  here, so there is no accidental path to calling a real vendor with demo
  data.

The MT5 adapter in particular never receives or stores real MT5 Manager
credentials — `src/lib/adapters/mt5/simulated.ts` fabricates a login
number, uses the seeded demo server/group, and returns synchronously
(matching how demo-account provisioning behaves on real brokers).

## Consequences

- UI/server-action code depends on `MT5Adapter`, `KycProviderAdapter`,
  etc. (interfaces), obtained from `src/lib/adapters/index.ts`, and never
  imports a `*/simulated.ts` file directly outside of tests and the
  factory itself.
- Adding a real provider later is additive: a new `*/live.ts` file
  implementing the same interface, selected by the factory when
  `INTEGRATIONS_MODE=live` and real credentials are present — no call
  site changes.
