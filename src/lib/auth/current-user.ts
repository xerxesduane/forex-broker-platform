import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type CurrentProfile = {
  id: string
  email: string
  accountKind: 'client' | 'staff'
  firstName: string | null
  lastName: string | null
  profileCompletedAt: string | null
  kycStatus: 'not_started' | 'submitted' | 'in_review' | 'needs_revision' | 'approved' | 'rejected'
}

/** Returns the authenticated user's profile row, or null if signed out.
 * Prefer this over reading auth.getUser() ad hoc so every call site gets
 * the same shape (and the same RLS-scoped query). */
export async function getCurrentProfile(supabase: SupabaseClient): Promise<CurrentProfile | null> {
  const { data: userData, error: userError } = await supabase.auth.getUser()
  if (userError || !userData.user) return null

  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, account_kind, first_name, last_name, profile_completed_at, kyc_status')
    .eq('id', userData.user.id)
    .single()

  if (error || !data) return null

  return {
    id: data.id as string,
    email: data.email as string,
    accountKind: data.account_kind as CurrentProfile['accountKind'],
    firstName: data.first_name as string | null,
    lastName: data.last_name as string | null,
    profileCompletedAt: data.profile_completed_at as string | null,
    kycStatus: data.kyc_status as CurrentProfile['kycStatus'],
  }
}

export type ActingStaff = {
  id: string
  email: string
  /** Every role key the member of staff holds. */
  roleKeys: string[]
  /**
   * A single role label for the audit trail's actor_role snapshot. Roles
   * can be reassigned later, so the audit row records what they held at
   * the time rather than joining back to a mutable assignment.
   */
  primaryRole: string
}

/**
 * The acting member of staff, for audit attribution. Returns null for a
 * signed-out or non-staff session — callers must still run
 * requirePermission for authorization; this only answers "who".
 */
export async function getActingStaff(supabase: SupabaseClient): Promise<ActingStaff | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data } = await supabase
    .from('staff_role_assignments')
    .select('roles(key)')
    .eq('profile_id', user.id)

  type Row = { roles: { key: string } | null }
  const roleKeys = ((data ?? []) as unknown as Row[])
    .map((row) => row.roles?.key)
    .filter((key): key is string => Boolean(key))

  // super_admin wins when someone holds several, so the audit trail names
  // the most privileged role in play.
  const primaryRole = roleKeys.includes('super_admin') ? 'super_admin' : roleKeys[0]
  if (!primaryRole) return null

  return { id: user.id, email: user.email ?? '', roleKeys, primaryRole }
}
