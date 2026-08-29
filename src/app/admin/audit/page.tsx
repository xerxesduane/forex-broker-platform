import { AuditTimeline, type AuditEventRow } from '@/components/admin/audit-timeline'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const ENTITY_TYPES = [
  'all',
  'profile',
  'kyc_case',
  'kyc_document',
  'trading_account',
  'deposit',
  'withdrawal',
  'transaction',
  'internal_transfer',
  'support_ticket',
  'commission',
  'introducing_broker',
  'role',
  'platform_setting',
] as const

export const dynamic = 'force-dynamic'

export default async function AdminAuditLogPage({
  searchParams,
}: {
  searchParams: Promise<{ entityType?: string | string[] }>
}) {
  const params = await searchParams
  const entityTypeParam = params.entityType
  const entityType = Array.isArray(entityTypeParam) ? entityTypeParam[0] : entityTypeParam
  const activeFilter = ENTITY_TYPES.includes(entityType as (typeof ENTITY_TYPES)[number])
    ? (entityType as (typeof ENTITY_TYPES)[number])
    : 'all'

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.AUDIT_VIEW)

  let query = supabase
    .from('audit_events')
    .select(
      'id, action, entity_type, reason, correlation_id, actor_role, created_at, before_state, after_state',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  if (activeFilter !== 'all') {
    query = query.eq('entity_type', activeFilter)
  }

  const { data: events } = await query

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Audit log</h1>
        <p className="text-muted-foreground mt-1 max-w-2xl">
          Append-only evidence across every domain. The database refuses UPDATE and DELETE on this
          table outright — not by omitting a policy, but with a trigger that raises, so even the
          service role cannot rewrite history.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {ENTITY_TYPES.map((type) => (
          <a key={type} href={type === 'all' ? '/admin/audit' : `/admin/audit?entityType=${type}`}>
            <Badge
              variant={activeFilter === type ? 'default' : 'outline'}
              className="cursor-pointer capitalize"
            >
              {type.replace('_', ' ')}
            </Badge>
          </a>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Most recent 100 events</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTimeline events={(events ?? []) as AuditEventRow[]} />
        </CardContent>
      </Card>
    </div>
  )
}
