import { ComingSoon } from '@/components/coming-soon'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminSettingsPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.SETTINGS_MANAGE)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <ComingSoon
        title="Site, email and integration settings"
        phase="Phase 5–6 — Growth & service / Hardening"
        body="Environment-level configuration (.env.example) covers integration mode today; an in-app settings UI is not built in this pass."
      />
    </div>
  )
}
