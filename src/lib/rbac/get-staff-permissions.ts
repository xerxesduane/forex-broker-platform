import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

/** All permission keys the current auth user holds via their assigned
 * staff roles — used for admin nav visibility (a courtesy, never the
 * authorization boundary; see requirePermission for that). */
export async function getStaffPermissions(supabase: SupabaseClient): Promise<Set<string>> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return new Set()

  const { data } = await supabase
    .from('staff_role_assignments')
    .select('roles(role_permissions(permissions(key)))')
    .eq('profile_id', user.id)

  const keys = new Set<string>()
  type Row = {
    roles: { role_permissions: { permissions: { key: string } | null }[] | null } | null
  }
  for (const row of (data ?? []) as unknown as Row[]) {
    for (const rp of row.roles?.role_permissions ?? []) {
      if (rp.permissions?.key) keys.add(rp.permissions.key)
    }
  }
  return keys
}
