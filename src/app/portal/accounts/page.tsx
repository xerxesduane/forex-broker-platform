import Link from 'next/link'
import { RequestDemoAccountForm } from '@/components/portal/request-demo-account-form'
import { RequestRealAccountForm } from '@/components/portal/request-real-account-form'
import { SyncSnapshotButton } from '@/components/admin/account-actions'
import { SimulatedBadge, TradingAccountStatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { formatAmount } from '@/domain/shared/money'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { loadSettings, readSetting } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function AccountsPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const [{ data: accounts }, settings] = await Promise.all([
    supabase
      .from('trading_accounts')
      .select(
        'id, account_type, status, mt5_login, mt5_server, base_currency, leverage, balance, equity, nickname, rejection_reason, snapshot_synced_at',
      )
      .eq('client_id', profile.id)
      .order('requested_at', { ascending: false }),
    loadSettings(supabase),
  ])

  const leverageOptions = readSetting(settings, 'trading.leverage_options')
  const realNeedsApproval = readSetting(settings, 'trading.real_accounts_require_approval')
  const isEligible = profile.kycStatus === 'approved'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trading accounts</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Accounts live on MetaTrader 5. This portal handles opening, funding and administering
            them — trading itself happens in the MT5 terminal.
          </p>
        </div>
        <SimulatedBadge />
      </div>

      {!isEligible ? (
        <Alert>
          <AlertTitle>Verification required</AlertTitle>
          <AlertDescription>
            Complete identity verification before opening a trading account. See{' '}
            <Link href="/portal/kyc" className="underline underline-offset-4">
              Verification
            </Link>
            .
          </AlertDescription>
        </Alert>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Open a new account</CardTitle>
            <CardDescription>
              Demo accounts open instantly.{' '}
              {realNeedsApproval
                ? 'Live accounts are reviewed by our trading operations team first.'
                : 'Live accounts open instantly under the current settings.'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="demo">
              <TabsList>
                <TabsTrigger value="demo">Demo account</TabsTrigger>
                <TabsTrigger value="real">Live account</TabsTrigger>
              </TabsList>
              <TabsContent value="demo" className="mt-4">
                <RequestDemoAccountForm />
              </TabsContent>
              <TabsContent value="real" className="mt-4">
                <RequestRealAccountForm leverageOptions={leverageOptions} />
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {!accounts || accounts.length === 0 ? (
            <p className="text-muted-foreground text-sm">No trading accounts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>MT5 login</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Conditions</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                    <TableHead className="text-right">Equity</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((account) => (
                    <TableRow key={account.id}>
                      <TableCell>
                        <Link
                          href={`/portal/accounts/${account.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {account.mt5_login ?? 'pending…'}
                        </Link>
                        {account.nickname ? (
                          <p className="text-muted-foreground text-xs">{account.nickname}</p>
                        ) : null}
                      </TableCell>
                      <TableCell className="capitalize">
                        {account.account_type === 'real' ? 'Live' : 'Demo'}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {account.base_currency} · 1:{account.leverage}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(Number(account.balance), account.base_currency)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {formatAmount(Number(account.equity), account.base_currency)}
                      </TableCell>
                      <TableCell>
                        <TradingAccountStatusBadge status={account.status} />
                        {account.rejection_reason ? (
                          <p className="text-muted-foreground mt-0.5 max-w-[14rem] text-xs">
                            {account.rejection_reason}
                          </p>
                        ) : null}
                      </TableCell>
                      <TableCell>
                        {account.status === 'active' ? (
                          <div className="flex justify-end">
                            <SyncSnapshotButton tradingAccountId={account.id} label="Refresh" />
                          </div>
                        ) : null}
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
