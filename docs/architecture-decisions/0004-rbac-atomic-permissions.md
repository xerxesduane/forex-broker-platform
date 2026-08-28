# ADR 0004: Deny-by-default RBAC with atomic permissions

## Status

Accepted

## Context

Staff roles in a brokerage back office have very different blast radii
(a support agent viewing a ticket vs. a finance approver releasing a
withdrawal). Page-level "can this role see this screen" access is not
enough — the brief calls for atomic, action-level permissions
(`kyc.review`, `withdrawal.approve`, `role.manage`, etc.), deny-by-default,
checked server-side.

## Decision

- `permissions` is a flat catalogue of atomic action strings, seeded in a
  migration (e.g. `kyc.review`, `kyc.decide`, `trading_account.view`,
  `trading_account.provision`, `audit.view`, `staff.manage`).
- `roles` bundle permissions via `role_permissions`. Seeded roles for
  this demo: `super_admin`, `kyc_analyst`, `finance_operator`,
  `finance_approver`, `support_agent` (matching the seeded staff
  accounts). `client` is a distinct, non-staff role with no entries in
  `role_permissions` — clients are authorized entirely by row ownership
  (their own `client_id`), never by the staff permission system.
- `staff_role_assignments` maps a profile to one or more roles.
- A single server-side helper, `requirePermission(permission)` in
  `src/lib/rbac`, is the only sanctioned way to gate a Server Action or
  route handler. It loads the caller's permissions and throws if the
  permission is absent — there is no "assume true" path. UI-level hiding
  of buttons/nav items is a courtesy, never the authorization boundary.
- Postgres Row Level Security is enabled on every table from its first
  migration, default-deny, with explicit policies added per access
  pattern (e.g. a client can `select` their own `kyc_cases` row; a
  `kyc_analyst` can `select`/`update` any row via a policy that checks
  their role assignment).

## Consequences

- Adding a new staff capability means adding a permission string, wiring
  it into `role_permissions` for the right role(s), and calling
  `requirePermission` at the mutation site — not adding an `if (role ===
  'admin')` check somewhere in a component.
- Because RLS defaults deny, a forgotten policy fails closed (no rows
  returned / write rejected) instead of failing open.
