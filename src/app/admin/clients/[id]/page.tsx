import { notFound } from 'next/navigation'
import { AuditTimeline, type AuditEventRow } from '@/components/admin/audit-timeline'
import { KycStatusBadge, TradingAccountStatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminClientDetailPage(props: PageProps<'/admin/clients/[id]'>) {
  const { id } = await props.params
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.CLIENT_VIEW)

  const { data: client } = await supabase
    .from('profiles')
    .select(
      'id, first_name, last_name, email, kyc_status, phone_number, country_of_residence, profile_completed_at, created_at',
    )
    .eq('id', id)
    .eq('account_kind', 'client')
    .single()

  if (!client) notFound()

  const [{ data: kycCases }, { data: accounts }] = await Promise.all([
    supabase
      .from('kyc_cases')
      .select('id, status, submitted_at, decided_at, decision_reason')
      .eq('client_id', id)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('trading_accounts')
      .select('id, account_type, status, mt5_login, base_currency, balance, requested_at')
      .eq('client_id', id)
      .order('requested_at', { ascending: false }),
  ])

  const kycCaseIds = (kycCases ?? []).map((c) => c.id)
  const accountIds = (accounts ?? []).map((a) => a.id)

  const auditSelect =
    'id, action, entity_type, reason, correlation_id, actor_role, created_at, before_state, after_state'

  const [profileEvents, kycEvents, accountEvents] = await Promise.all([
    supabase
      .from('audit_events')
      .select(auditSelect)
      .eq('entity_type', 'profile')
      .eq('entity_id', id),
    kycCaseIds.length
      ? supabase
          .from('audit_events')
          .select(auditSelect)
          .eq('entity_type', 'kyc_case')
          .in('entity_id', kycCaseIds)
      : Promise.resolve({ data: [] as AuditEventRow[] }),
    accountIds.length
      ? supabase
          .from('audit_events')
          .select(auditSelect)
          .eq('entity_type', 'trading_account')
          .in('entity_id', accountIds)
      : Promise.resolve({ data: [] as AuditEventRow[] }),
  ])

  const timeline = [
    ...((profileEvents.data ?? []) as AuditEventRow[]),
    ...((kycEvents.data ?? []) as AuditEventRow[]),
    ...((accountEvents.data ?? []) as AuditEventRow[]),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {client.first_name} {client.last_name}
          </h1>
          <p className="text-muted-foreground mt-1">{client.email}</p>
        </div>
        <KycStatusBadge status={client.kyc_status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Profile</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-3">
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{client.phone_number || '—'}</dd>
            <dt className="text-muted-foreground">Country</dt>
            <dd>{client.country_of_residence || '—'}</dd>
            <dt className="text-muted-foreground">Profile completed</dt>
            <dd>
              {client.profile_completed_at
                ? new Date(client.profile_completed_at).toLocaleDateString()
                : 'No'}
            </dd>
            <dt className="text-muted-foreground">Registered</dt>
            <dd>{new Date(client.created_at).toLocaleDateString()}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">KYC history</CardTitle>
        </CardHeader>
        <CardContent>
          {!kycCases || kycCases.length === 0 ? (
            <p className="text-muted-foreground text-sm">No KYC submissions yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {kycCases.map((c) => (
                <li key={c.id} className="flex items-center justify-between py-2">
                  <span>{c.submitted_at ? new Date(c.submitted_at).toLocaleString() : '—'}</span>
                  <KycStatusBadge status={c.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trading accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {!accounts || accounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No trading accounts yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {accounts.map((a) => (
                <li key={a.id} className="flex items-center justify-between py-2">
                  <span className="capitalize">
                    {a.account_type} · {a.mt5_login ?? 'provisioning…'} ·{' '}
                    {a.balance.toLocaleString(undefined, {
                      style: 'currency',
                      currency: a.base_currency,
                    })}
                  </span>
                  <TradingAccountStatusBadge status={a.status} />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Complete timeline &amp; audit evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTimeline events={timeline} />
        </CardContent>
      </Card>
    </div>
  )
}
