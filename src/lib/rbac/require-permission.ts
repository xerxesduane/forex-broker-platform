import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { PermissionKey } from '@/domain/rbac/permissions'

/** Thrown by requirePermission — callers should let this propagate to an
 * error boundary rather than catch-and-continue (deny-by-default, ADR 0004). */
export class PermissionDeniedError extends Error {
  readonly permission: PermissionKey
  constructor(permission: PermissionKey) {
    super(`Missing required permission: ${permission}`)
    this.name = 'PermissionDeniedError'
    this.permission = permission
  }
}

/**
 * The only sanctioned server-side authorization check (ADR 0004). Calls
 * the has_permission(...) Postgres function seeded in
 * supabase/migrations/00000000000002_identity_and_rbac.sql, which checks
 * the caller's staff_role_assignments -> role_permissions chain. Throws
 * on any failure to reach the database, not just an explicit "false" —
 * an authorization check that fails open on a network error is a bug.
 */
export async function requirePermission(
  supabase: SupabaseClient,
  permission: PermissionKey,
): Promise<void> {
  const { data, error } = await supabase.rpc('has_permission', { permission_key: permission })
  if (error || data !== true) {
    throw new PermissionDeniedError(permission)
  }
}

export async function hasPermission(
  supabase: SupabaseClient,
  permission: PermissionKey,
): Promise<boolean> {
  const { data, error } = await supabase.rpc('has_permission', { permission_key: permission })
  return !error && data === true
}
