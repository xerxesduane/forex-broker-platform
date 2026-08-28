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
