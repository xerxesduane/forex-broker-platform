import Link from 'next/link'
import { RequestDemoAccountForm } from '@/components/portal/request-demo-account-form'
import { DemoDataBadge, TradingAccountStatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AccountsPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const { data: accounts } = await supabase
    .from('trading_accounts')
    .select(
      'id, account_type, status, mt5_login, mt5_server, base_currency, leverage, balance, equity',
    )
    .eq('client_id', profile.id)
    .order('requested_at', { ascending: false })

  const isEligible = profile.kycStatus === 'approved'

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Trading accounts</h1>
          <p className="text-muted-foreground mt-1">Simulated MT5 accounts — no real funds.</p>
        </div>
        <DemoDataBadge />
      </div>

      {!isEligible && (
        <Alert>
          <AlertTitle>Verification required</AlertTitle>
          <AlertDescription>
            Complete KYC verification before requesting a trading account. See{' '}
            <Link href="/portal/kyc" className="underline underline-offset-4">
              Verification
            </Link>
            .
          </AlertDescription>
        </Alert>
      )}

      {isEligible && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Request a demo account</CardTitle>
            <CardDescription>
              Demo accounts provision instantly with a simulated $10,000 balance.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <RequestDemoAccountForm />
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
                    <TableHead>Currency</TableHead>
                    <TableHead>Leverage</TableHead>
                    <TableHead>Balance</TableHead>
                    <TableHead>Status</TableHead>
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
                          {account.mt5_login ?? '—'}
                        </Link>
                      </TableCell>
                      <TableCell className="capitalize">{account.account_type}</TableCell>
                      <TableCell>{account.base_currency}</TableCell>
                      <TableCell>1:{account.leverage}</TableCell>
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
