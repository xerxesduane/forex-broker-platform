import { AuditTimeline, type AuditEventRow } from '@/components/admin/audit-timeline'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const ENTITY_TYPES = ['all', 'profile', 'kyc_case', 'trading_account'] as const

export default async function AdminAuditLogPage(props: PageProps<'/admin/audit'>) {
  const searchParams = await props.searchParams
  const entityTypeParam = searchParams.entityType
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
        <p className="text-muted-foreground mt-1">Append-only evidence across every domain.</p>
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
