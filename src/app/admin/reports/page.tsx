import { PageHeader } from '@/components/admin/page-header'
import { BarChart } from '@/components/charts/bar-chart'
import { StatTile } from '@/components/charts/stat-tile'
import { TrendChart } from '@/components/charts/trend-chart'
import { SimulatedBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { formatAmount } from '@/domain/shared/money'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

function monthBuckets(count: number) {
  const now = new Date()
  return Array.from({ length: count }, (_, index) => {
    const offset = count - 1 - index
    const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - offset, 1))
    const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1))
    return {
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

const KYC_STAGE_LABEL: Record<string, string> = {
  not_started: 'Registered, not started',
  submitted: 'Submitted',
  in_review: 'In review',
  needs_revision: 'Needs revision',
  approved: 'Approved',
  rejected: 'Rejected',
}

export default async function AdminReportsPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.AUDIT_VIEW)

  const buckets = monthBuckets(12)
  const windowStart = buckets[0]?.start.toISOString() ?? new Date(0).toISOString()

  const [
    clientResult,
    depositResult,
    withdrawalResult,
    accountResult,
    commissionResult,
    ledgerResult,
  ] = await Promise.all([
    supabase
      .from('profiles')
      .select('id, created_at, kyc_status, country_of_residence')
      .eq('account_kind', 'client'),
    supabase.from('deposits').select('amount, status, created_at').gte('created_at', windowStart),
    supabase
      .from('withdrawals')
      .select('amount, fee, status, created_at')
      .gte('created_at', windowStart),
    supabase.from('trading_accounts').select('account_type, status, base_currency, leverage'),
    supabase.from('commissions').select('amount, status'),
    supabase.from('ledger_account_balances').select('kind, balance, currency'),
  ])

  const clients = (clientResult.data ?? []) as {
    id: string
    created_at: string
    kyc_status: string
    country_of_residence: string | null
  }[]
  const deposits = (depositResult.data ?? []) as {
    amount: number
    status: string
    created_at: string
  }[]
  const withdrawals = (withdrawalResult.data ?? []) as {
    amount: number
    fee: number
    status: string
    created_at: string
  }[]
  const accounts = (accountResult.data ?? []) as {
    account_type: string
    status: string
    base_currency: string
    leverage: number
  }[]
  const commissions = (commissionResult.data ?? []) as { amount: number; status: string }[]
  const ledgerBalances = (ledgerResult.data ?? []) as {
    kind: string
    balance: number
    currency: string
  }[]

  function bucketise(rows: { created_at: string }[], value: (row: never) => number) {
    return buckets.map((bucket) =>
      rows.reduce((sum, row) => {
        const at = new Date(row.created_at).getTime()
        if (at < bucket.start.getTime() || at >= bucket.end.getTime()) return sum
        return sum + value(row as never)
      }, 0),
    )
  }

  const signupSeries = bucketise(clients, () => 1)
  const depositSeries = bucketise(
    deposits.filter((d) => d.status === 'approved'),
    (row: { amount: number }) => Number(row.amount),
  )
  const withdrawalSeries = bucketise(
    withdrawals.filter((w) => w.status === 'paid'),
    (row: { amount: number }) => Number(row.amount),
  )
  const netFlowSeries = depositSeries.map((value, index) => value - (withdrawalSeries[index] ?? 0))

  // --- KYC funnel ----------------------------------------------------------
  const stageCounts = new Map<string, number>()
  for (const client of clients) {
    stageCounts.set(client.kyc_status, (stageCounts.get(client.kyc_status) ?? 0) + 1)
  }
  const funnelOrder = [
    'not_started',
    'submitted',
    'in_review',
    'needs_revision',
    'approved',
    'rejected',
  ]
  const funnelData = funnelOrder
    .filter((stage) => (stageCounts.get(stage) ?? 0) > 0)
    .map((stage) => ({
      label: KYC_STAGE_LABEL[stage] ?? stage,
      value: stageCounts.get(stage) ?? 0,
    }))

  const approved = stageCounts.get('approved') ?? 0
  const conversion = clients.length > 0 ? (approved / clients.length) * 100 : 0

  // --- Country mix ---------------------------------------------------------
  const countryCounts = new Map<string, number>()
  for (const client of clients) {
    const country = client.country_of_residence ?? 'Unknown'
    countryCounts.set(country, (countryCounts.get(country) ?? 0) + 1)
  }
  const countryData = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([country, count]) => ({ label: country, value: count }))

  // --- Account mix ---------------------------------------------------------
  const accountMix = new Map<string, number>()
  for (const account of accounts) {
    const key = `${account.account_type === 'demo' ? 'Demo' : 'Live'} · ${account.status}`
    accountMix.set(key, (accountMix.get(key) ?? 0) + 1)
  }
  const accountData = [...accountMix.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, value]) => ({ label, value }))

  // --- Headline finance ----------------------------------------------------
  const totalDeposited = deposits
    .filter((d) => d.status === 'approved')
    .reduce((sum, d) => sum + Number(d.amount), 0)
  const totalWithdrawn = withdrawals
    .filter((w) => w.status === 'paid')
    .reduce((sum, w) => sum + Number(w.amount), 0)
  const feeIncome =
    ledgerBalances
      .filter((row) => row.kind === 'fee_income')
      .reduce((sum, row) => sum + Number(row.balance), 0) || 0
  const sumKinds = (...kinds: string[]) =>
    ledgerBalances
      .filter((row) => kinds.includes(row.kind))
      .reduce((sum, row) => sum + Number(row.balance), 0)

  const clientLiability = sumKinds('client_wallet')
  const houseBank = sumKinds('house')
  const inClearing = sumKinds('clearing')
  const payables = sumKinds('liability')
  const brokerExpense = sumKinds('expense')
  // Assets + expenses on one side, liabilities + income on the other. The
  // gap is displayed rather than asserted: a balance sheet that only ever
  // claims to reconcile is worth less than one that shows its own residual.
  const reconciliationGap =
    houseBank + inClearing + brokerExpense - (clientLiability + payables + feeIncome)
  const commissionCost = commissions
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + Number(c.amount), 0)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Reports"
        description="Rolling twelve months. Every figure is computed from the operational tables at read time — there is no reporting copy of the data to fall out of step."
        action={<SimulatedBadge />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Deposits credited"
          value={formatAmount(totalDeposited, 'USD')}
          hint="12 months"
        />
        <StatTile
          label="Withdrawals paid"
          value={formatAmount(totalWithdrawn, 'USD')}
          hint="12 months"
        />
        <StatTile label="Fee income" value={formatAmount(feeIncome, 'USD')} hint="all time" />
        <StatTile
          label="Commission paid"
          value={formatAmount(commissionCost, 'USD')}
          hint="partner cost"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Net client flow</CardTitle>
          <CardDescription>
            Deposits credited minus withdrawals paid, by month. A negative month means more left
            than arrived.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <TrendChart
            labels={buckets.map((b) => b.label)}
            series={[{ name: 'Net flow', values: netFlowSeries, tone: 'primary' }]}
            format="currency"
            height={220}
          />
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Client acquisition</CardTitle>
            <CardDescription>New client registrations by month.</CardDescription>
          </CardHeader>
          <CardContent>
            <TrendChart
              labels={buckets.map((b) => b.label)}
              series={[{ name: 'New clients', values: signupSeries, tone: 'primary' }]}
              format="number"
              height={180}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification funnel</CardTitle>
            <CardDescription>
              {conversion.toFixed(1)}% of registered clients are fully verified.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={funnelData} emptyMessage="No clients yet." />
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Clients by country</CardTitle>
            <CardDescription>Top eight declared countries of residence.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={countryData} emptyMessage="No country data yet." />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Trading accounts</CardTitle>
            <CardDescription>By type and lifecycle state.</CardDescription>
          </CardHeader>
          <CardContent>
            <BarChart data={accountData} emptyMessage="No trading accounts yet." />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Balance sheet summary</CardTitle>
          <CardDescription>
            Folded from the ledger at read time. Assets and expenses on one side, what the
            broker owes and has earned on the other — the two must meet exactly.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                <TableRow>
                  <TableCell>Owed to clients (liability)</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(clientLiability, 'USD')}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Withdrawals payable (liability)</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(payables, 'USD')}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Fee income</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(feeIncome, 'USD')}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>House bank (asset)</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(houseBank, 'USD')}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>In clearing (asset in transit)</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(inClearing, 'USD')}
                  </TableCell>
                </TableRow>
                <TableRow>
                  <TableCell>Broker expense (commissions, rebates, goodwill)</TableCell>
                  <TableCell className="text-right tabular-nums">
                    {formatAmount(brokerExpense, 'USD')}
                  </TableCell>
                </TableRow>
                <TableRow className="border-t-2 font-medium">
                  <TableCell>Reconciliation gap</TableCell>
                  <TableCell
                    className={cn(
                      'text-right tabular-nums',
                      Math.abs(reconciliationGap) < 0.005 ? 'text-emerald-600 dark:text-emerald-400' : 'text-destructive',
                    )}
                  >
                    {formatAmount(reconciliationGap, 'USD')}
                  </TableCell>
                </TableRow>
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
