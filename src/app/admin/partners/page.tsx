import Link from 'next/link'
import { PageHeader } from '@/components/admin/page-header'
import {
  CommissionActions,
  PartnerStatusDialog,
  RebatePayButton,
} from '@/components/admin/partner-actions'
import { StatTile } from '@/components/charts/stat-tile'
import { IbStatusBadge, RewardStatusBadge, SimulatedBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { resolveRank, type Rank } from '@/domain/growth/commission'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { formatAmount } from '@/domain/shared/money'
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type IbRow = {
  id: string
  profile_id: string
  ib_code: string
  status: string
  commission_bps: number
  applied_at: string
  profiles: { first_name: string | null; last_name: string | null; email: string } | null
}

type CommissionRow = {
  id: string
  ib_id: string
  amount: number
  currency: string
  status: string
  created_at: string
  source_client_id: string | null
  introducing_brokers: { ib_code: string } | null
}

type RebateRow = {
  id: string
  client_id: string
  amount: number
  currency: string
  status: string
  created_at: string
  profiles: { first_name: string | null; last_name: string | null; email: string } | null
}

function unwrap<T>(value: T | T[] | null): T | null {
  if (Array.isArray(value)) return value[0] ?? null
  return value
}

export default async function AdminPartnersPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.REFERRAL_MANAGE)

  const canManageCommissions = await hasPermission(supabase, PERMISSIONS.COMMISSION_MANAGE)

  const [ibResult, referralResult, commissionResult, rebateResult, rankResult, depositResult] =
    await Promise.all([
      supabase
        .from('introducing_brokers')
        .select(
          'id, profile_id, ib_code, status, commission_bps, applied_at, profiles!profile_id(first_name, last_name, email)',
        )
        .order('applied_at', { ascending: false }),
      supabase.from('referral_relationships').select('ib_id, referee_id'),
      supabase
        .from('commissions')
        .select(
          'id, ib_id, amount, currency, status, created_at, source_client_id, introducing_brokers!ib_id(ib_code)',
        )
        .order('created_at', { ascending: false })
        .limit(60),
      supabase
        .from('rebates')
        .select(
          'id, client_id, amount, currency, status, created_at, profiles!client_id(first_name, last_name, email)',
        )
        .order('created_at', { ascending: false })
        .limit(30),
      supabase.from('ranks').select('id, key, name, min_referred_volume, benefits, sort_order'),
      supabase.from('deposits').select('client_id, amount').eq('status', 'approved'),
    ])

  const partners = ((ibResult.data ?? []) as unknown as IbRow[]).map((row) => ({
    ...row,
    profiles: unwrap(row.profiles),
  }))

  const referrals = (referralResult.data ?? []) as { ib_id: string | null; referee_id: string }[]
  const approvedDeposits = (depositResult.data ?? []) as { client_id: string; amount: number }[]

  const volumeByClient = new Map<string, number>()
  for (const deposit of approvedDeposits) {
    volumeByClient.set(
      deposit.client_id,
      (volumeByClient.get(deposit.client_id) ?? 0) + Number(deposit.amount),
    )
  }

  const downlineByIb = new Map<string, string[]>()
  for (const referral of referrals) {
    if (!referral.ib_id) continue
    const list = downlineByIb.get(referral.ib_id) ?? []
    list.push(referral.referee_id)
    downlineByIb.set(referral.ib_id, list)
  }

  const ranks: Rank[] = ((rankResult.data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: row.id as string,
    key: row.key as string,
    name: row.name as string,
    minReferredVolume: Number(row.min_referred_volume),
    benefits: (row.benefits ?? {}) as Rank['benefits'],
    sortOrder: Number(row.sort_order),
  }))

  const commissions = ((commissionResult.data ?? []) as unknown as CommissionRow[]).map((row) => ({
    ...row,
    introducing_brokers: unwrap(row.introducing_brokers),
  }))

  const rebates = ((rebateResult.data ?? []) as unknown as RebateRow[]).map((row) => ({
    ...row,
    profiles: unwrap(row.profiles),
  }))

  const pendingApplications = partners.filter((p) => p.status === 'pending').length
  const pendingCommissionValue = commissions
    .filter((c) => c.status === 'pending')
    .reduce((sum, c) => sum + Number(c.amount), 0)
  const payableValue = commissions
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + Number(c.amount), 0)
  const paidValue = commissions
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Partners & commissions"
        description="Introducing brokers, their downline, and the rewards a credited deposit generates. Approving a commission makes it payable; paying it posts a balanced transaction into the partner's wallet."
        action={<SimulatedBadge />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Applications to review" value={String(pendingApplications)} />
        <StatTile
          label="Commission pending approval"
          value={formatAmount(pendingCommissionValue, 'USD')}
        />
        <StatTile label="Approved and payable" value={formatAmount(payableValue, 'USD')} />
        <StatTile label="Paid to partners" value={formatAmount(paidValue, 'USD')} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Introducing brokers</CardTitle>
          <CardDescription>
            Rank is derived from the partner&apos;s referred deposit volume, not stored — so it is
            always current.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {partners.length === 0 ? (
            <p className="text-muted-foreground text-sm">No partner applications yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Referred clients</TableHead>
                    <TableHead className="text-right">Referred volume</TableHead>
                    <TableHead>Rank</TableHead>
                    <TableHead className="text-right">Rate</TableHead>
                    <TableHead className="text-right">Manage</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {partners.map((partner) => {
                    const downline = downlineByIb.get(partner.id) ?? []
                    const volume = downline.reduce(
                      (sum, clientId) => sum + (volumeByClient.get(clientId) ?? 0),
                      0,
                    )
                    const rank = resolveRank(volume, ranks)
                    return (
                      <TableRow key={partner.id}>
                        <TableCell>
                          <Link
                            href={`/admin/clients/${partner.profile_id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {`${partner.profiles?.first_name ?? ''} ${partner.profiles?.last_name ?? ''}`.trim() ||
                              partner.profiles?.email}
                          </Link>
                        </TableCell>
                        <TableCell className="font-mono text-xs">{partner.ib_code}</TableCell>
                        <TableCell>
                          <IbStatusBadge status={partner.status} />
                        </TableCell>
                        <TableCell className="text-right tabular-nums">{downline.length}</TableCell>
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(volume, 'USD')}
                        </TableCell>
                        <TableCell>
                          {rank ? <Badge variant="secondary">{rank.name}</Badge> : '—'}
                        </TableCell>
                        <TableCell className="text-right tabular-nums">
                          {(
                            Number(rank?.benefits.commission_bps ?? partner.commission_bps) / 100
                          ).toFixed(2)}
                          %
                        </TableCell>
                        <TableCell>
                          <div className="flex justify-end">
                            <PartnerStatusDialog
                              ibId={partner.id}
                              ibCode={partner.ib_code}
                              status={partner.status}
                              commissionBps={Number(partner.commission_bps)}
                            />
                          </div>
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Commissions</CardTitle>
          <CardDescription>
            Generated automatically when a referred client&apos;s deposit is credited.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {commissions.length === 0 ? (
            <p className="text-muted-foreground text-sm">No commissions generated yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Partner</TableHead>
                    <TableHead>Earned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {commissions.map((commission) => (
                    <TableRow key={commission.id}>
                      <TableCell className="font-mono text-xs">
                        {commission.introducing_brokers?.ib_code ?? '—'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(commission.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <RewardStatusBadge status={commission.status} />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatAmount(Number(commission.amount), commission.currency)}
                      </TableCell>
                      <TableCell>
                        {canManageCommissions ? (
                          <CommissionActions
                            commissionId={commission.id}
                            status={commission.status}
                          />
                        ) : (
                          <span className="text-muted-foreground block text-right text-xs">
                            View only
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client rebates</CardTitle>
          <CardDescription>
            A share of each credited deposit, returned to the depositing client.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rebates.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rebates generated yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Earned</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right">Action</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rebates.map((rebate) => (
                    <TableRow key={rebate.id}>
                      <TableCell>
                        <Link
                          href={`/admin/clients/${rebate.client_id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {`${rebate.profiles?.first_name ?? ''} ${rebate.profiles?.last_name ?? ''}`.trim() ||
                            rebate.profiles?.email}
                        </Link>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(rebate.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <RewardStatusBadge status={rebate.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(Number(rebate.amount), rebate.currency)}
                      </TableCell>
                      <TableCell>
                        {canManageCommissions ? (
                          <RebatePayButton rebateId={rebate.id} status={rebate.status} />
                        ) : (
                          <span className="text-muted-foreground block text-right text-xs">
                            View only
                          </span>
                        )}
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
