import Link from 'next/link'
import { ArrowRight, ShieldAlert, Timer, TriangleAlert, Wallet } from 'lucide-react'
import { PageHeader } from '@/components/admin/page-header'
import { BarChart } from '@/components/charts/bar-chart'
import { StatTile } from '@/components/charts/stat-tile'
import { TrendChart } from '@/components/charts/trend-chart'
import { KycStatusBadge, MoneyMovementStatusBadge, PriorityBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { depositMethodLabel } from '@/domain/finance/types'
import { formatAmount } from '@/domain/shared/money'
import { isBreachingFirstResponse } from '@/domain/support/state-machine'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

/** Month buckets, oldest first, for the last `count` months including this one. */
function monthBuckets(count: number): { key: string; label: string; start: Date; end: Date }[] {
  const now = new Date()
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    return {
      key: `${start.getUTCFullYear()}-${start.getUTCMonth()}`,
      label: start.toLocaleDateString('en-US', {
        month: 'short',
        year: '2-digit',
        timeZone: 'UTC',
      }),
      start,
      end,
    }
  })
}

function bucketIndex(buckets: ReturnType<typeof monthBuckets>, iso: string): number {
  const at = new Date(iso).getTime()
  return buckets.findIndex((b) => at >= b.start.getTime() && at < b.end.getTime())
}

export default async function AdminDashboardPage() {
  const supabase = await createSupabaseServerClient()
  const buckets = monthBuckets(6)
  const windowStart = buckets[0]?.start.toISOString() ?? new Date(0).toISOString()

  const [
    clientsResult,
    pendingKycResult,
    activeAccountsResult,
    auditResult,
    depositsResult,
    withdrawalsResult,
    ticketsResult,
    trialBalanceResult,
    walletsResult,
    accountRequestsResult,
  ] = await Promise.all([
    supabase.from('profiles').select('id, created_at').eq('account_kind', 'client'),
    supabase
      .from('kyc_cases')
      .select(
        'id, client_id, status, submitted_at, profiles!client_id(first_name, last_name, email)',
      )
      .in('status', ['submitted', 'in_review'])
      .order('submitted_at', { ascending: true })
      .limit(6),
    supabase
      .from('trading_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'active'),
    supabase.from('audit_events').select('*', { count: 'exact', head: true }),
    supabase
      .from('deposits')
      .select('id, amount, currency, status, method, created_at')
      .gte('created_at', windowStart),
    supabase
      .from('withdrawals')
      .select('id, amount, fee, currency, status, created_at')
      .gte('created_at', windowStart),
    supabase
      .from('support_tickets')
      .select('id, subject, status, priority, created_at, first_response_at, reference_code')
      .in('status', ['open', 'pending'])
      .order('created_at', { ascending: true })
      .limit(6),
    supabase.from('trial_balance').select('currency, total_debits, total_credits, difference'),
    supabase.from('wallet_balances').select('available_balance, currency'),
    supabase
      .from('trading_accounts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'requested'),
  ])

  const clients = (clientsResult.data ?? []) as { id: string; created_at: string }[]
  const deposits = (depositsResult.data ?? []) as {
    id: string
    amount: number
    currency: string
    status: string
    method: string
    created_at: string
  }[]
  const withdrawals = (withdrawalsResult.data ?? []) as {
    id: string
    amount: number
    fee: number
    status: string
    created_at: string
  }[]
  const tickets = (ticketsResult.data ?? []) as {
    id: string
    subject: string
    status: string
    priority: 'low' | 'medium' | 'high'
    created_at: string
    first_response_at: string | null
    reference_code: string | null
  }[]

  // --- Money in / money out, by month --------------------------------------
  const depositSeries = new Array(buckets.length).fill(0) as number[]
  const withdrawalSeries = new Array(buckets.length).fill(0) as number[]
  const signupSeries = new Array(buckets.length).fill(0) as number[]

  function addTo(series: number[], index: number, value: number) {
    if (index >= 0 && index < series.length) series[index] = (series[index] ?? 0) + value
  }

  for (const deposit of deposits) {
    if (deposit.status !== 'approved') continue
    addTo(depositSeries, bucketIndex(buckets, deposit.created_at), Number(deposit.amount))
  }
  for (const withdrawal of withdrawals) {
    if (withdrawal.status !== 'paid') continue
    addTo(withdrawalSeries, bucketIndex(buckets, withdrawal.created_at), Number(withdrawal.amount))
  }
  for (const client of clients) {
    addTo(signupSeries, bucketIndex(buckets, client.created_at), 1)
  }

  const thisMonth = depositSeries[depositSeries.length - 1] ?? 0
  const lastMonth = depositSeries[depositSeries.length - 2] ?? 0
  const depositDelta = lastMonth > 0 ? ((thisMonth - lastMonth) / lastMonth) * 100 : null

  const signupsThisMonth = signupSeries[signupSeries.length - 1] ?? 0
  const signupsLastMonth = signupSeries[signupSeries.length - 2] ?? 0
  const signupDelta =
    signupsLastMonth > 0 ? ((signupsThisMonth - signupsLastMonth) / signupsLastMonth) * 100 : null

  // --- Deposit mix by method ----------------------------------------------
  const methodTotals = new Map<string, number>()
  for (const deposit of deposits) {
    if (deposit.status !== 'approved') continue
    methodTotals.set(
      deposit.method,
      (methodTotals.get(deposit.method) ?? 0) + Number(deposit.amount),
    )
  }
  const methodData = [...methodTotals.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([method, total]) => ({
      label: depositMethodLabel(method),
      value: total,
      display: formatAmount(total, 'USD'),
    }))

  // --- Queues --------------------------------------------------------------
  const depositsAwaiting = deposits.filter((d) => d.status === 'confirmed').length
  const withdrawalsAwaiting = withdrawals.filter((w) => w.status === 'pending').length
  const clientLiability = ((walletsResult.data ?? []) as { available_balance: number }[]).reduce(
    (sum, row) => sum + Number(row.available_balance),
    0,
  )

  const trialBalance = (trialBalanceResult.data ?? []) as { difference: number; currency: string }[]
  const outOfBalance = trialBalance.filter((row) => Number(row.difference) !== 0)

  type KycQueueRow = {
    id: string
    status: string
    submitted_at: string
    profiles: { first_name: string | null; last_name: string | null; email: string } | null
  }
  const pendingKycCases = ((pendingKycResult.data ?? []) as unknown as KycQueueRow[]).map(
    (row) => ({
      ...row,
      profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
    }),
  )

  const now = new Date()

  return (
    <div className="space-y-6">
      <PageHeader
        title="Operations dashboard"
        description="Everything on this page is live demo data — queues, balances and volumes are computed from the same tables the workflows write to."
      />

      {outOfBalance.length > 0 ? (
        <Card className="border-2 border-red-500/60">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-red-600">
              <TriangleAlert className="size-4" aria-hidden="true" />
              Ledger out of balance
            </CardTitle>
            <CardDescription>
              Debits and credits disagree in {outOfBalance.map((r) => r.currency).join(', ')}. Open
              Wallets &amp; ledger and investigate before anything else.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Clients"
          value={clients.length.toLocaleString()}
          deltaPercent={signupDelta}
          polarity="up-good"
          hint="new this month"
        />
        <StatTile
          label="Deposits this month"
          value={formatAmount(thisMonth, 'USD')}
          deltaPercent={depositDelta}
          polarity="up-good"
          hint="vs last month"
        />
        <StatTile
          label="Owed to clients"
          value={formatAmount(clientLiability, 'USD')}
          hint="ledger-derived"
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
        <StatTile
          label="Audit events"
          value={(auditResult.count ?? 0).toLocaleString()}
          hint="append-only evidence"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Money in and out</CardTitle>
            <CardDescription>
              Credited deposits against paid withdrawals, by month. One axis — both series are the
              same measure in the same currency.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              labels={buckets.map((b) => b.label)}
              series={[
                { name: 'Deposits credited', values: depositSeries, tone: 'primary' },
                { name: 'Withdrawals paid', values: withdrawalSeries, tone: 'comparison' },
              ]}
              format="currency"
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Needs attention</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            {[
              {
                label: 'KYC awaiting review',
                count: pendingKycCases.length,
                href: '/admin/kyc',
                icon: ShieldAlert,
              },
              {
                label: 'Deposits to decide',
                count: depositsAwaiting,
                href: '/admin/deposits',
                icon: Wallet,
              },
              {
                label: 'Withdrawals to approve',
                count: withdrawalsAwaiting,
                href: '/admin/withdrawals',
                icon: ShieldAlert,
              },
              {
                label: 'Account requests',
                count: accountRequestsResult.count ?? 0,
                href: '/admin/trading-accounts',
                icon: Timer,
              },
              {
                label: 'Open tickets',
                count: tickets.length,
                href: '/admin/support',
                icon: Timer,
              },
            ].map((item) => {
              const Icon = item.icon
              return (
                <Link
                  key={item.label}
                  href={item.href}
                  className="hover:bg-muted -mx-2 flex items-center justify-between rounded-md px-2 py-1.5 transition-colors"
                >
                  <span className="flex items-center gap-2 text-sm">
                    <Icon className="text-muted-foreground size-4" aria-hidden="true" />
                    {item.label}
                  </span>
                  <span
                    className={
                      item.count > 0
                        ? 'text-sm font-semibold tabular-nums'
                        : 'text-muted-foreground text-sm tabular-nums'
                    }
                  >
                    {item.count}
                  </span>
                </Link>
              )
            })}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">KYC queue</CardTitle>
              <CardDescription>Oldest first.</CardDescription>
            </div>
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
            {pendingKycCases.length === 0 ? (
              <p className="text-muted-foreground text-sm">Nothing waiting for review.</p>
            ) : (
              <ul className="divide-y">
                {pendingKycCases.map((kycCase) => {
                  const client = kycCase.profiles
                  return (
                    <li key={kycCase.id} className="flex items-center justify-between gap-3 py-2">
                      <Link
                        href={`/admin/kyc/${kycCase.id}`}
                        className="truncate text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {`${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim() ||
                          client?.email}
                      </Link>
                      <KycStatusBadge status={kycCase.status} />
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Support queue</CardTitle>
              <CardDescription>Flagged when past the first-response target.</CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              render={
                <Link href="/admin/support">
                  View all <ArrowRight className="ml-1 size-3.5" />
                </Link>
              }
            />
          </CardHeader>
          <CardContent>
            {tickets.length === 0 ? (
              <p className="text-muted-foreground text-sm">No open tickets.</p>
            ) : (
              <ul className="divide-y">
                {tickets.map((ticket) => {
                  const breaching = isBreachingFirstResponse({
                    priority: ticket.priority,
                    createdAt: new Date(ticket.created_at),
                    firstResponseAt: ticket.first_response_at
                      ? new Date(ticket.first_response_at)
                      : null,
                    now,
                  })
                  return (
                    <li key={ticket.id} className="flex items-center justify-between gap-3 py-2">
                      <Link
                        href={`/admin/support/${ticket.id}`}
                        className="min-w-0 flex-1 truncate text-sm font-medium underline-offset-4 hover:underline"
                      >
                        {ticket.subject}
                      </Link>
                      <span className="flex shrink-0 items-center gap-1.5">
                        {breaching ? (
                          <span className="text-xs font-medium text-red-600 dark:text-red-400">
                            Overdue
                          </span>
                        ) : null}
                        <PriorityBadge status={ticket.priority} />
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deposit mix by method</CardTitle>
          <CardDescription>
            Credited value over the last {buckets.length} months. One hue — each row is named, so a
            second colour would encode nothing.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BarChart data={methodData} emptyMessage="No credited deposits in this window yet." />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent money movement</CardTitle>
        </CardHeader>
        <CardContent>
          {deposits.length === 0 ? (
            <p className="text-muted-foreground text-sm">No deposits in this window.</p>
          ) : (
            <ul className="divide-y text-sm">
              {deposits
                .slice()
                .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))
                .slice(0, 6)
                .map((deposit) => (
                  <li key={deposit.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-muted-foreground">
                      {depositMethodLabel(deposit.method)} ·{' '}
                      {new Date(deposit.created_at).toLocaleDateString()}
                    </span>
                    <span className="flex items-center gap-2">
                      <MoneyMovementStatusBadge status={deposit.status} />
                      <span className="font-medium tabular-nums">
                        {formatAmount(Number(deposit.amount), deposit.currency)}
                      </span>
                    </span>
                  </li>
                ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
