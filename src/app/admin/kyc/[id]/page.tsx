import Link from 'next/link'
import { notFound } from 'next/navigation'
import { AuditTimeline, type AuditEventRow } from '@/components/admin/audit-timeline'
import { KycDecisionForm } from '@/components/admin/kyc-decision-form'
import {
  ClaimCaseButton,
  DocumentReviewButtons,
  RequestRevisionDialog,
  RiskFlagPicker,
} from '@/components/admin/kyc-review-tools'
import { KycStatusBadge, SimulatedBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { isTerminalKycStatus } from '@/domain/kyc/state-machine'
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AdminKycCaseDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.KYC_VIEW)
  const [canDecide, canReview] = await Promise.all([
    hasPermission(supabase, PERMISSIONS.KYC_DECIDE),
    hasPermission(supabase, PERMISSIONS.KYC_REVIEW),
  ])

  const { data: kycCase } = await supabase
    .from('kyc_cases')
    .select(
      'id, client_id, status, employment_status, source_of_funds, declared_country, submitted_at, decided_at, decision_reason, analyst_id, claimed_at, risk_flags, profiles!client_id(first_name, last_name, email, country_of_residence, phone_number)',
    )
    .eq('id', id)
    .maybeSingle()

  if (!kycCase) notFound()

  const client = Array.isArray(kycCase.profiles) ? kycCase.profiles[0] : kycCase.profiles

  const { data: analyst } = kycCase.analyst_id
    ? await supabase
        .from('profiles')
        .select('first_name, last_name, email')
        .eq('id', kycCase.analyst_id)
        .maybeSingle()
    : { data: null }

  const { data: documents } = await supabase
    .from('kyc_documents')
    .select(
      'id, doc_type, original_filename, content_type, size_bytes, uploaded_at, review_status, review_note',
    )
    .eq('kyc_case_id', id)

  const { data: auditEvents } = await supabase
    .from('audit_events')
    .select(
      'id, action, entity_type, reason, correlation_id, actor_role, created_at, before_state, after_state',
    )
    .eq('entity_type', 'kyc_case')
    .eq('entity_id', id)
    .order('created_at', { ascending: false })

  const unclaimed = !kycCase.analyst_id && !isTerminalKycStatus(kycCase.status)

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
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
          {analyst ? (
            <p className="text-muted-foreground mt-1 text-sm">
              Claimed by{' '}
              {`${analyst.first_name ?? ''} ${analyst.last_name ?? ''}`.trim() || analyst.email}
              {kycCase.claimed_at ? ` on ${new Date(kycCase.claimed_at).toLocaleString()}` : ''}
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <KycStatusBadge status={kycCase.status} />
          {canReview && unclaimed ? <ClaimCaseButton kycCaseId={kycCase.id} /> : null}
          {canReview && !isTerminalKycStatus(kycCase.status) ? (
            <RequestRevisionDialog kycCaseId={kycCase.id} />
          ) : null}
        </div>
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
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <div>
            <CardTitle className="text-base">Documents</CardTitle>
            <CardDescription>
              Metadata only — no real identity document is ever collected in this build.
            </CardDescription>
          </div>
          <SimulatedBadge />
        </CardHeader>
        <CardContent>
          {!documents || documents.length === 0 ? (
            <p className="text-muted-foreground text-sm">No documents attached.</p>
          ) : (
            <ul className="divide-y text-sm">
              {documents.map((doc) => (
                <li key={doc.id} className="flex items-center justify-between gap-3 py-2">
                  <div className="min-w-0">
                    <p className="truncate">
                      {doc.original_filename}{' '}
                      <span className="text-muted-foreground">({doc.doc_type})</span>
                    </p>
                    <p className="text-muted-foreground text-xs">
                      {(doc.size_bytes / 1024).toFixed(0)} KB
                      {doc.review_note ? ` · ${doc.review_note}` : ''}
                    </p>
                  </div>
                  {canReview && !isTerminalKycStatus(kycCase.status) ? (
                    <DocumentReviewButtons
                      documentId={doc.id}
                      reviewStatus={doc.review_status ?? 'pending'}
                    />
                  ) : (
                    <span className="text-muted-foreground text-xs capitalize">
                      {doc.review_status ?? 'pending'}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>

      {canReview ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Internal risk flags</CardTitle>
            <CardDescription>
              Staff-only context for the decision. Never shown to the client.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RiskFlagPicker kycCaseId={kycCase.id} flags={(kycCase.risk_flags ?? []) as string[]} />
          </CardContent>
        </Card>
      ) : null}

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
