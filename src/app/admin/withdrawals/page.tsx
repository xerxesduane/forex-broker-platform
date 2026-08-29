import Link from 'next/link'
import { ShieldAlert } from 'lucide-react'
import { PageHeader } from '@/components/admin/page-header'
import { WithdrawalQueueRow } from '@/components/admin/withdrawal-queue-row'
import { StatTile } from '@/components/charts/stat-tile'
import { MoneyMovementStatusBadge, SimulatedBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { withdrawalMethodLabel } from '@/domain/finance/types'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { formatAmount } from '@/domain/shared/money'
import { getActingStaff } from '@/lib/auth/current-user'
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { loadFinanceSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type WithdrawalRow = {
  id: string
  client_id: string
  amount: number
  fee: number
  currency: string
  method: string
  status: string
  reference_code: string | null
  payout_detail: string | null
  requires_dual_approval: boolean
  created_at: string
  profiles: { first_name: string | null; last_name: string | null; email: string } | null
}

type ApprovalRow = {
  withdrawal_id: string
  approver_id: string
  decision: string
  profiles: { first_name: string | null; last_name: string | null; email: string } | null
}

function displayName(
  profile: { first_name: string | null; last_name: string | null; email: string } | null,
) {
  if (!profile) return 'Unknown'
  return `${profile.first_name ?? ''} ${profile.last_name ?? ''}`.trim() || profile.email
}

export default async function AdminWithdrawalsPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.WITHDRAWAL_VIEW)

  const [canApprove, staff, settings] = await Promise.all([
    hasPermission(supabase, PERMISSIONS.WITHDRAWAL_APPROVE),
    getActingStaff(supabase),
    loadFinanceSettings(supabase),
  ])

  const { data } = await supabase
    .from('withdrawals')
    .select(
      'id, client_id, amount, fee, currency, method, status, reference_code, payout_detail, requires_dual_approval, created_at, profiles!client_id(first_name, last_name, email)',
    )
    .order('created_at', { ascending: false })
    .limit(100)

  const withdrawals = ((data ?? []) as unknown as WithdrawalRow[]).map((row) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
  }))

  const { data: approvalData } = await supabase
    .from('withdrawal_approvals')
    .select(
      'withdrawal_id, approver_id, decision, profiles!approver_id(first_name, last_name, email)',
    )

  const approvalsByWithdrawal = new Map<
    string,
    { name: string; decision: string; approverId: string }[]
  >()
  for (const raw of (approvalData ?? []) as unknown as ApprovalRow[]) {
    const profile = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles
    const list = approvalsByWithdrawal.get(raw.withdrawal_id) ?? []
    list.push({ name: displayName(profile), decision: raw.decision, approverId: raw.approver_id })
    approvalsByWithdrawal.set(raw.withdrawal_id, list)
  }

  const queued = withdrawals.filter((w) => w.status === 'pending')
  const approved = withdrawals.filter((w) => w.status === 'approved')
  const paid = withdrawals.filter((w) => w.status === 'paid')

  const queuedTotal = queued.reduce((sum, w) => sum + Number(w.amount), 0)
  const paidTotal = paid.reduce((sum, w) => sum + Number(w.amount) - Number(w.fee), 0)
  const dualApprovalCount = queued.filter((w) => w.requires_dual_approval).length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Withdrawals"
        description={`Funds are reserved by a ledger posting the moment a client requests a withdrawal, so nothing can be spent twice while it sits in this queue. At or above ${formatAmount(settings.withdrawalDualApprovalThreshold, 'USD')}, two distinct approvers are required.`}
        action={<SimulatedBadge />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Awaiting approval" value={String(queued.length)} />
        <StatTile label="Value awaiting approval" value={formatAmount(queuedTotal, 'USD')} />
        <StatTile
          label="Needing two approvers"
          value={String(dualApprovalCount)}
          hint="maker-checker"
          icon={<ShieldAlert className="size-4" aria-hidden="true" />}
        />
        <StatTile label="Paid out (net, all time)" value={formatAmount(paidTotal, 'USD')} />
      </div>

      {queued.length + approved.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Action queue</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Approvals</TableHead>
                    <TableHead className="text-right">Client receives</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {[...queued, ...approved].map((withdrawal) => {
                    const approvals = approvalsByWithdrawal.get(withdrawal.id) ?? []
                    const required = withdrawal.requires_dual_approval ? 2 : 1
                    const held = approvals.filter((a) => a.decision === 'approve').length
                    return (
                      <TableRow key={withdrawal.id}>
                        <TableCell className="font-mono text-xs">
                          {withdrawal.reference_code}
                          <MoneyMovementStatusBadge
                            status={withdrawal.status}
                            className="ml-2 align-middle"
                          />
                        </TableCell>
                        <TableCell>
                          <Link
                            href={`/admin/clients/${withdrawal.client_id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {displayName(withdrawal.profiles)}
                          </Link>
                          <p className="text-muted-foreground text-xs">
                            to {withdrawal.payout_detail}
                          </p>
                        </TableCell>
                        <TableCell>{withdrawalMethodLabel(withdrawal.method)}</TableCell>
                        <TableCell>
                          <Badge variant={held >= required ? 'secondary' : 'outline'}>
                            {held} of {required}
                          </Badge>
                          {approvals.length > 0 ? (
                            <p className="text-muted-foreground mt-0.5 text-xs">
                              {approvals.map((a) => a.name).join(', ')}
                            </p>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-right font-medium tabular-nums">
                          {formatAmount(
                            Number(withdrawal.amount) - Number(withdrawal.fee),
                            withdrawal.currency,
                          )}
                          <p className="text-muted-foreground text-xs font-normal">
                            {formatAmount(Number(withdrawal.amount), withdrawal.currency)} less{' '}
                            {formatAmount(Number(withdrawal.fee), withdrawal.currency)} fee
                          </p>
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <WithdrawalQueueRow
                              withdrawalId={withdrawal.id}
                              status={withdrawal.status}
                              canApprove={canApprove}
                              requiresDualApproval={withdrawal.requires_dual_approval}
                              approvals={approvals}
                              alreadySigned={approvals.some((a) => a.approverId === staff?.id)}
                              amountLabel={`${formatAmount(Number(withdrawal.amount), withdrawal.currency)} requested by ${displayName(withdrawal.profiles)}`}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All withdrawals</CardTitle>
        </CardHeader>
        <CardContent>
          {withdrawals.length === 0 ? (
            <p className="text-muted-foreground text-sm">No withdrawals yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Gross</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawals.map((withdrawal) => (
                    <TableRow key={withdrawal.id}>
                      <TableCell className="font-mono text-xs">
                        {withdrawal.reference_code}
                      </TableCell>
                      <TableCell>
                        <Link
                          href={`/admin/clients/${withdrawal.client_id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {displayName(withdrawal.profiles)}
                        </Link>
                      </TableCell>
                      <TableCell>{withdrawalMethodLabel(withdrawal.method)}</TableCell>
                      <TableCell>
                        <MoneyMovementStatusBadge status={withdrawal.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(withdrawal.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(Number(withdrawal.amount), withdrawal.currency)}
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
