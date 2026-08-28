import Link from 'next/link'
import { ArrowRight } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient()

  const [clientsResult, pendingKycResult, activeAccountsResult, auditResult] = await Promise.all([
    supabase
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('account_kind', 'client'),
    supabase
      .from('kyc_cases')
      .select('*', { count: 'exact', head: true })
      .in('status', ['submitted', 'in_review']),
    supabase
      .from('trading_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase.from('audit_events').select('*', { count: 'exact', head: true }),
  ])

  const clientCount = clientsResult.count ?? 0
  const pendingKycCount = pendingKycResult.count ?? 0
  const activeAccountCount = activeAccountsResult.count ?? 0
  const recentAuditCount = auditResult.count ?? 0

  const { data: pendingCases } = await supabase
    .from('kyc_cases')
    .select('id, client_id, status, submitted_at, profiles!client_id(first_name, last_name, email)')
    .in('status', ['submitted', 'in_review'])
    .order('submitted_at', { ascending: true })
    .limit(5)

  const metrics = [
    { label: 'Clients', value: clientCount },
    { label: 'KYC awaiting review', value: pendingKycCount },
    { label: 'Active demo accounts', value: activeAccountCount },
    { label: 'Audit events recorded', value: recentAuditCount },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Operations dashboard</h1>
        <p className="text-muted-foreground mt-1">
          Demo data — see the KYC queue for what needs attention.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardHeader className="pb-2">
              <CardTitle className="text-muted-foreground text-sm font-medium">
                {metric.label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{metric.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader className="flex-row items-center justify-between space-y-0">
          <CardTitle className="text-base">KYC queue</CardTitle>
          <Button
            variant="outline"
            size="sm"
            render={
              <Link href="/admin/kyc">
                View all <ArrowRight className="ml-1 size-3.5" />
              </Link>
            }
          />
        </CardHeader>
        <CardContent>
          {!pendingCases || pendingCases.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing waiting for review.</p>
          ) : (
            <ul className="divide-y">
              {pendingCases.map((c) => {
                const client = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
                return (
                  <li key={c.id} className="flex items-center justify-between py-2 text-sm">
                    <Link
                      href={`/admin/kyc/${c.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {client?.first_name} {client?.last_name} ({client?.email})
                    </Link>
                    <span className="text-muted-foreground">
                      {c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : ''}
                    </span>
                  </li>
                )
              })}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
