import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AuditTimeline, type AuditEventRow } from '@/components/admin/audit-timeline'
import { KycDecisionForm } from '@/components/admin/kyc-decision-form'
import { KycStatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { isTerminalKycStatus } from '@/domain/kyc/state-machine'
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminKycCaseDetailPage(props: PageProps<'/admin/kyc/[id]'>) {
  const { id } = await props.params
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.KYC_VIEW)
  const canDecide = await hasPermission(supabase, PERMISSIONS.KYC_DECIDE)

  const { data: kycCase } = await supabase
    .from('kyc_cases')
    .select(
      'id, client_id, status, employment_status, source_of_funds, declared_country, submitted_at, decided_at, decision_reason, profiles!client_id(first_name, last_name, email, country_of_residence, phone_number)',
    )
    .eq('id', id)
    .single()

  if (!kycCase) notFound()

  const client = Array.isArray(kycCase.profiles) ? kycCase.profiles[0] : kycCase.profiles

  const { data: documents } = await supabase
    .from('kyc_documents')
    .select('id, doc_type, original_filename, content_type, size_bytes, uploaded_at')
    .eq('kyc_case_id', id)

  const { data: auditEvents } = await supabase
    .from('audit_events')
    .select(
      'id, action, entity_type, reason, correlation_id, actor_role, created_at, before_state, after_state',
    )
    .eq('entity_type', 'kyc_case')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {client?.first_name} {client?.last_name}
          </h1>
          <p className="text-muted-foreground mt-1">
            <Link
              href={`/admin/clients/${kycCase.client_id}`}
              className="underline underline-offset-4"
            >
              View client
            </Link>{' '}
            · {client?.email}
          </p>
        </div>
        <KycStatusBadge status={kycCase.status} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Submission</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-3">
            <dt className="text-muted-foreground">Employment</dt>
            <dd className="capitalize">{kycCase.employment_status?.replace('_', ' ')}</dd>
            <dt className="text-muted-foreground">Source of funds</dt>
            <dd className="capitalize">{kycCase.source_of_funds?.replace('_', ' ')}</dd>
            <dt className="text-muted-foreground">Declared country</dt>
            <dd>{kycCase.declared_country}</dd>
            <dt className="text-muted-foreground">Residence (profile)</dt>
            <dd>{client?.country_of_residence}</dd>
            <dt className="text-muted-foreground">Phone</dt>
            <dd>{client?.phone_number}</dd>
            <dt className="text-muted-foreground">Submitted</dt>
            <dd>{kycCase.submitted_at ? new Date(kycCase.submitted_at).toLocaleString() : '—'}</dd>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Documents</CardTitle>
        </CardHeader>
        <CardContent>
          {!documents || documents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No documents attached.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {documents.map((doc) => (
                <li key={doc.id} className="flex justify-between">
                  <span>
                    {doc.original_filename}{' '}
                    <span className="text-muted-foreground">({doc.doc_type})</span>
                  </span>
                  <span className="text-muted-foreground">
                    {(doc.size_bytes / 1024).toFixed(0)} KB
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {!isTerminalKycStatus(kycCase.status) && canDecide && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decision</CardTitle>
          </CardHeader>
          <CardContent>
            <KycDecisionForm kycCaseId={kycCase.id} />
          </CardContent>
        </Card>
      )}

      {isTerminalKycStatus(kycCase.status) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Decision</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Decided {kycCase.decided_at ? new Date(kycCase.decided_at).toLocaleString() : ''}.{' '}
            {kycCase.decision_reason && `Reason: ${kycCase.decision_reason}`}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Audit evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <AuditTimeline events={(auditEvents ?? []) as AuditEventRow[]} />
        </CardContent>
      </Card>
    </div>
  )
}
