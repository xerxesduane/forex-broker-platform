import { ComingSoon } from '@/components/coming-soon'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminSupportPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.SUPPORT_VIEW)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Support tickets</h1>
      <ComingSoon
        title="Ticket queues and SLA views"
        phase="Phase 5 — Growth & service"
        body="Ticket and message tables exist with RLS in place; the queue UI is not built in this pass."
      />
    </div>
  )
}
