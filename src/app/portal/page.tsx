import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle } from 'lucide-react'
import { DemoDataBadge, KycStatusBadge, TradingAccountStatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function PortalDashboardPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const { data: accounts } = await supabase
    .from('trading_accounts')
    .select('id, account_type, status, mt5_login, base_currency, balance, equity')
    .eq('client_id', profile.id)
    .order('requested_at', { ascending: false })

  const steps = [
    {
      done: Boolean(profile.profileCompletedAt),
      label: 'Complete your profile',
      href: '/portal/profile',
    },
    { done: profile.kycStatus === 'approved', label: 'Get verified (KYC)', href: '/portal/kyc' },
    {
      done: (accounts?.length ?? 0) > 0,
      label: 'Request a demo trading account',
      href: '/portal/accounts',
    },
  ]

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">
          Welcome{profile.firstName ? `, ${profile.firstName}` : ''}
        </h1>
        <p className="text-muted-foreground mt-1">
          Here&apos;s where things stand on your demo account.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Getting started</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {steps.map((step) => (
            <div key={step.label} className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                {step.done ? (
                  <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
                ) : (
                  <Circle className="text-muted-foreground size-5" aria-hidden="true" />
                )}
                <span className={step.done ? 'text-muted-foreground line-through' : ''}>
                  {step.label}
                </span>
              </div>
              {!step.done && (
                <Button
                  size="sm"
                  variant="outline"
                  render={
                    <Link href={step.href}>
                      Continue <ArrowRight className="ml-1 size-3.5" />
                    </Link>
                  }
                />
              )}
            </div>
          ))}
        </CardContent>
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Verification status</CardTitle>
          </CardHeader>
          <CardContent>
            <KycStatusBadge status={profile.kycStatus} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Trading accounts</CardTitle>
            <DemoDataBadge />
          </CardHeader>
          <CardContent>
            {!accounts || accounts.length === 0 ? (
              <p className="text-muted-foreground text-sm">No trading accounts yet.</p>
            ) : (
              <ul className="space-y-3">
                {accounts.map((account) => (
                  <li key={account.id} className="flex items-center justify-between text-sm">
                    <div>
                      <Link
                        href={`/portal/accounts/${account.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {account.account_type === 'demo' ? 'Demo' : 'Real'} ·{' '}
                        {account.mt5_login ?? 'provisioning…'}
                      </Link>
                      <p className="text-muted-foreground">
                        {account.balance.toLocaleString(undefined, {
                          style: 'currency',
                          currency: account.base_currency,
                        })}{' '}
                        balance
                      </p>
                    </div>
                    <TradingAccountStatusBadge status={account.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
