import Link from 'next/link'
import { PageHeader } from '@/components/admin/page-header'
import { DepositQueueRow } from '@/components/admin/deposit-queue-row'
import { StatTile } from '@/components/charts/stat-tile'
import { MoneyMovementStatusBadge, SimulatedBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { depositMethodLabel } from '@/domain/finance/types'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { formatAmount } from '@/domain/shared/money'
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { loadFinanceSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type DepositRow = {
  id: string
  client_id: string
  amount: number
  currency: string
  method: string
  status: string
  provider_ref: string | null
  reference_code: string | null
  created_at: string
  transaction_id: string | null
  review_notes: string | null
  profiles: { first_name: string | null; last_name: string | null; email: string } | null
}

function clientName(profile: DepositRow['profiles']): string {
  if (!profile) return 'Unknown client'
  const name = `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim()
  return name || profile.email
}

export default async function AdminDepositsPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.DEPOSIT_VIEW)

  const canApprove = await hasPermission(supabase, PERMISSIONS.DEPOSIT_APPROVE)
  const settings = await loadFinanceSettings(supabase)

  const { data } = await supabase
    .from('deposits')
    .select(
      'id, client_id, amount, currency, method, status, provider_ref, reference_code, created_at, transaction_id, review_notes, profiles!client_id(first_name, last_name, email)',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const deposits = ((data ?? []) as unknown as DepositRow[]).map((row) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
  }))

  const awaitingReview = deposits.filter((d) => d.status === 'confirmed')
  const awaitingProvider = deposits.filter((d) => d.status === 'pending')
  const credited = deposits.filter((d) => d.status === 'approved')

  const creditedTotal = credited.reduce((sum, d) => sum + Number(d.amount), 0)
  const queuedTotal = awaitingReview.reduce((sum, d) => sum + Number(d.amount), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Deposits"
        description={`Provider-confirmed deposits at or below ${formatAmount(settings.depositAutoCreditLimit, 'USD')} credit automatically. Anything larger waits here for a finance decision.`}
        action={<SimulatedBadge />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Awaiting your decision"
          value={String(awaitingReview.length)}
          hint="confirmed by provider"
        />
        <StatTile label="Value in the queue" value={formatAmount(queuedTotal, 'USD')} />
        <StatTile
          label="Awaiting provider"
          value={String(awaitingProvider.length)}
          hint="not yet settled"
        />
        <StatTile label="Credited (all time)" value={formatAmount(creditedTotal, 'USD')} />
      </div>

      {awaitingReview.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Awaiting a finance decision</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {awaitingReview.map((deposit) => (
                    <TableRow key={deposit.id}>
                      <TableCell className="font-mono text-xs">{deposit.reference_code}</TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/clients/${deposit.client_id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {clientName(deposit.profiles)}
                        </Link>
                      </TableCell>
                      <TableCell>{depositMethodLabel(deposit.method)}</TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatAmount(Number(deposit.amount), deposit.currency)}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          <DepositQueueRow
                            depositId={deposit.id}
                            canApprove={canApprove}
                            amountLabel={`${formatAmount(Number(deposit.amount), deposit.currency)} from ${clientName(deposit.profiles)}`}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All deposits</CardTitle>
        </CardHeader>
        <CardContent>
          {deposits.length === 0 ? (
            <p className="text-muted-foreground text-sm">No deposits yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Provider ref</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deposits.map((deposit) => (
                    <TableRow key={deposit.id}>
                      <TableCell className="font-mono text-xs">{deposit.reference_code}</TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/clients/${deposit.client_id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {clientName(deposit.profiles)}
                        </Link>
                      </TableCell>
                      <TableCell>{depositMethodLabel(deposit.method)}</TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {deposit.provider_ref ?? '—'}
                      </TableCell>
                      <TableCell>
                        <MoneyMovementStatusBadge status={deposit.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(deposit.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(Number(deposit.amount), deposit.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
