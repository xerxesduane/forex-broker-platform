import Link from 'next/link'
import {
  AccountLifecycleDialog,
  ProvisioningDecision,
  SyncSnapshotButton,
} from '@/components/admin/account-actions'
import { PageHeader } from '@/components/admin/page-header'
import { StatTile } from '@/components/charts/stat-tile'
import { SimulatedBadge, TradingAccountStatusBadge } from '@/components/status-badge'
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
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { formatAmount } from '@/domain/shared/money'
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type AccountRow = {
  id: string
  client_id: string
  account_type: string
  status: string
  mt5_login: number | null
  mt5_server: string | null
  mt5_group: string | null
  base_currency: string
  leverage: number
  spread_model: string
  balance: number
  equity: number
  used_margin: number
  margin_level: number | null
  snapshot_synced_at: string | null
  requested_at: string
  rejection_reason: string | null
  profiles: { first_name: string | null; last_name: string | null; email: string } | null
}

export default async function AdminTradingAccountsPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.TRADING_ACCOUNT_VIEW)

  const [canProvision, canManage] = await Promise.all([
    hasPermission(supabase, PERMISSIONS.TRADING_ACCOUNT_PROVISION),
    hasPermission(supabase, PERMISSIONS.TRADING_ACCOUNT_MANAGE),
  ])

  const { data } = await supabase
    .from('trading_accounts')
    .select(
      'id, client_id, account_type, status, mt5_login, mt5_server, mt5_group, base_currency, leverage, spread_model, balance, equity, used_margin, margin_level, snapshot_synced_at, requested_at, rejection_reason, profiles!client_id(first_name, last_name, email)',
    )
    .order('requested_at', { ascending: false })
    .limit(150)

  const accounts = ((data ?? []) as unknown as AccountRow[]).map((row) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
  }))

  const queued = accounts.filter((a) => a.status === 'requested')
  const active = accounts.filter((a) => a.status === 'active')
  const demoCount = accounts.filter((a) => a.account_type === 'demo').length
  const liveCount = accounts.filter((a) => a.account_type === 'real').length

  function name(account: AccountRow) {
    return (
      `${account.profiles?.first_name ?? ''} ${account.profiles?.last_name ?? ''}`.trim() ||
      account.profiles?.email ||
      'Unknown'
    )
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Trading accounts"
        description="Balance, equity and margin are an MT5 snapshot synced through the adapter, never a wallet. Money movement lives in the ledger; this page never touches it."
        action={<SimulatedBadge />}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Awaiting provisioning" value={String(queued.length)} />
        <StatTile label="Active" value={String(active.length)} />
        <StatTile label="Demo accounts" value={String(demoCount)} />
        <StatTile label="Live accounts" value={String(liveCount)} />
      </div>

      {queued.length > 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Requests awaiting trading operations</CardTitle>
            <CardDescription>
              Real accounts queue here because <code>trading.real_accounts_require_approval</code>{' '}
              is on. Demo accounts provision automatically.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Conditions</TableHead>
                    <TableHead>Requested</TableHead>
                    <TableHead className="text-right">Decision</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {queued.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <Link
                          href={`/admin/clients/${account.client_id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {name(account)}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{account.account_type}</TableCell>
                      <TableCell className="text-sm">
                        {account.base_currency} · 1:{account.leverage} ·{' '}
                        {account.spread_model === 'raw_plus_commission' ? 'Raw' : 'Standard'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(account.requested_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end">
                          {canProvision ? (
                            <ProvisioningDecision tradingAccountId={account.id} />
                          ) : (
                            <span className="text-muted-foreground text-xs">View only</span>
                          )}
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
          <CardTitle className="text-base">All accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {accounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No trading accounts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Login</TableHead>
                    <TableHead>Server / group</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Equity</TableHead>
                    <TableHead className="text-right">Margin level</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <Link
                          href={`/admin/clients/${account.client_id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {name(account)}
                        </Link>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {account.mt5_login ?? '—'}
                        <Badge variant="outline" className="ml-1.5 capitalize">
                          {account.account_type}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground font-mono text-xs">
                        {account.mt5_server ?? '—'}
                        <span className="block">{account.mt5_group ?? ''}</span>
                      </TableCell>
                      <TableCell>
                        <TradingAccountStatusBadge status={account.status} />
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(Number(account.balance), account.base_currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(Number(account.equity), account.base_currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {account.margin_level ? `${Number(account.margin_level).toFixed(1)}%` : '—'}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-end gap-1.5">
                          {account.status === 'active' ? (
                            <SyncSnapshotButton tradingAccountId={account.id} label="Sync" />
                          ) : null}
                          {canManage ? (
                            <AccountLifecycleDialog
                              tradingAccountId={account.id}
                              status={account.status}
                            />
                          ) : null}
                        </div>
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
