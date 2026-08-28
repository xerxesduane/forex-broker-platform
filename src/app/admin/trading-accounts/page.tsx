import Link from 'next/link'
import { DemoDataBadge, TradingAccountStatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminTradingAccountsPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.TRADING_ACCOUNT_VIEW)

  const { data: accounts } = await supabase
    .from('trading_accounts')
    .select(
      'id, client_id, account_type, status, mt5_login, mt5_server, base_currency, leverage, balance, requested_at, profiles!client_id(first_name, last_name, email)',
    )
    .order('requested_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trading accounts</h1>
          <p className="text-muted-foreground mt-1">Simulated MT5 accounts across all clients.</p>
        </div>
        <DemoDataBadge />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {!accounts || accounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No trading accounts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>MT5 login</TableHead>
                    <TableHead>Server</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => {
                    const client = Array.isArray(account.profiles)
                      ? account.profiles[0]
                      : account.profiles
                    return (
                      <TableRow key={account.id}>
                        <TableCell>
                          <Link
                            href={`/admin/clients/${account.client_id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {client?.first_name} {client?.last_name}
                          </Link>
                        </TableCell>
                        <TableCell>{account.mt5_login ?? '—'}</TableCell>
                        <TableCell>{account.mt5_server ?? '—'}</TableCell>
                        <TableCell className="capitalize">{account.account_type}</TableCell>
                        <TableCell>
                          {account.balance.toLocaleString(undefined, {
                            style: 'currency',
                            currency: account.base_currency,
                          })}
                        </TableCell>
                        <TableCell>
                          <TradingAccountStatusBadge status={account.status} />
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
    </div>
  )
}
