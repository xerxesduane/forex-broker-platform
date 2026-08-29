import Link from 'next/link'
import { ArrowRight, CheckCircle2, Circle, Wallet } from 'lucide-react'
import { StatTile } from '@/components/charts/stat-tile'
import {
  KycStatusBadge,
  MoneyMovementStatusBadge,
  SimulatedBadge,
  TradingAccountStatusBadge,
} from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { formatAmount } from '@/domain/shared/money'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { loadWallet } from '@/lib/ledger'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PortalDashboardPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const [
    { data: accounts },
    { data: notifications },
    { data: deposits },
    { data: tickets },
    wallet,
  ] = await Promise.all([
    supabase
      .from('trading_accounts')
      .select('id, account_type, status, mt5_login, base_currency, balance, equity, nickname')
      .eq('client_id', profile.id)
      .order('requested_at', { ascending: false }),
    supabase
      .from('notifications')
      .select('id, title, body, created_at, read_at')
      .is('read_at', null)
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('deposits')
      .select('id, amount, currency, status, reference_code, created_at')
      .order('created_at', { ascending: false })
      .limit(4),
    supabase
      .from('support_tickets')
      .select('id, subject, status, reference_code')
      .in('status', ['open', 'pending'])
      .order('updated_at', { ascending: false })
      .limit(3),
    loadWallet(supabase, profile.id),
  ])

  const accountList = accounts ?? []
  const activeAccounts = accountList.filter((account) => account.status === 'active')

  const steps = [
    {
      done: Boolean(profile.profileCompletedAt),
      label: 'Complete your profile',
      href: '/portal/profile',
    },
    { done: profile.kycStatus === 'approved', label: 'Verify your identity', href: '/portal/kyc' },
    {
      done: accountList.length > 0,
      label: 'Open a trading account',
      href: '/portal/accounts',
    },
    {
      done: (wallet?.availableBalance ?? 0) > 0,
      label: 'Fund your wallet',
      href: '/portal/wallet',
    },
  ]

  const nextStep = steps.find((step) => !step.done)
  const completed = steps.filter((step) => step.done).length

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            Welcome{profile.firstName ? `, ${profile.firstName}` : ''}
          </h1>
          <p className="text-muted-foreground mt-1">Here&apos;s where things stand today.</p>
        </div>
        <SimulatedBadge />
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Wallet balance"
          value={formatAmount(wallet?.availableBalance ?? 0, wallet?.currency ?? 'USD')}
          icon={<Wallet className="size-4" aria-hidden="true" />}
        />
        <StatTile label="Active accounts" value={String(activeAccounts.length)} />
        <StatTile
          label="Deposits pending"
          value={formatAmount(wallet?.pendingDeposits ?? 0, 'USD')}
        />
        <StatTile
          label="Verification"
          value={profile.kycStatus === 'approved' ? 'Verified' : 'In progress'}
        />
      </div>

      {nextStep ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Getting started</CardTitle>
            <CardDescription>
              {completed} of {steps.length} steps done. Next: {nextStep.label.toLowerCase()}.
            </CardDescription>
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
                {!step.done ? (
                  <Button
                    size="sm"
                    variant={step === nextStep ? 'default' : 'outline'}
                    render={
                      <Link href={step.href}>
                        Continue <ArrowRight className="ml-1 size-3.5" />
                      </Link>
                    }
                  />
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Trading accounts</CardTitle>
            <Button
              size="sm"
              variant="outline"
              render={
                <Link href="/portal/accounts">
                  Manage <ArrowRight className="ml-1 size-3.5" />
                </Link>
              }
            />
          </CardHeader>
          <CardContent>
            {accountList.length === 0 ? (
              <p className="text-muted-foreground text-sm">No trading accounts yet.</p>
            ) : (
              <ul className="divide-y">
                {accountList.map((account) => (
                  <li key={account.id} className="flex items-center justify-between gap-3 py-2">
                    <div className="min-w-0">
                      <Link
                        href={`/portal/accounts/${account.id}`}
                        className="font-medium underline-offset-4 hover:underline"
                      >
                        {account.account_type === 'demo' ? 'Demo' : 'Live'} ·{' '}
                        {account.mt5_login ?? 'pending…'}
                      </Link>
                      <p className="text-muted-foreground text-xs">
                        {formatAmount(Number(account.balance), account.base_currency)} balance
                      </p>
                    </div>
                    <TradingAccountStatusBadge status={account.status} />
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <div>
              <CardTitle className="text-base">Verification</CardTitle>
              <CardDescription>Required before funding or live trading.</CardDescription>
            </div>
            <KycStatusBadge status={profile.kycStatus} />
          </CardHeader>
          <CardContent className="space-y-3">
            {profile.kycStatus === 'approved' ? (
              <p className="text-muted-foreground text-sm">
                You are fully verified. Everything on the platform is available to you.
              </p>
            ) : (
              <>
                <p className="text-muted-foreground text-sm">
                  {profile.kycStatus === 'needs_revision'
                    ? 'Our compliance team needs something else from you.'
                    : profile.kycStatus === 'not_started'
                      ? 'Verification takes about two minutes in this demo.'
                      : 'Your application is with our compliance team.'}
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  render={<Link href="/portal/kyc">Open verification</Link>}
                />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Recent deposits</CardTitle>
            <Button
              size="sm"
              variant="outline"
              render={
                <Link href="/portal/wallet">
                  Wallet <ArrowRight className="ml-1 size-3.5" />
                </Link>
              }
            />
          </CardHeader>
          <CardContent>
            {!deposits || deposits.length === 0 ? (
              <p className="text-muted-foreground text-sm">No deposits yet.</p>
            ) : (
              <ul className="divide-y text-sm">
                {deposits.map((deposit) => (
                  <li key={deposit.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="text-muted-foreground font-mono text-xs">
                      {deposit.reference_code}
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

        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
            <CardTitle className="text-base">Updates</CardTitle>
            <Button
              size="sm"
              variant="outline"
              render={
                <Link href="/portal/notifications">
                  All <ArrowRight className="ml-1 size-3.5" />
                </Link>
              }
            />
          </CardHeader>
          <CardContent>
            {(!notifications || notifications.length === 0) &&
            (!tickets || tickets.length === 0) ? (
              <p className="text-muted-foreground text-sm">Nothing needs your attention.</p>
            ) : (
              <ul className="divide-y text-sm">
                {(notifications ?? []).map((notification) => (
                  <li key={notification.id} className="py-2">
                    <p className="font-medium">{notification.title}</p>
                    <p className="text-muted-foreground text-xs">{notification.body}</p>
                  </li>
                ))}
                {(tickets ?? []).map((ticket) => (
                  <li key={ticket.id} className="py-2">
                    <Link
                      href={`/portal/support/${ticket.id}`}
                      className="font-medium underline-offset-4 hover:underline"
                    >
                      {ticket.subject}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      Support ticket {ticket.reference_code}
                    </p>
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
