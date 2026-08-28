import { notFound } from 'next/navigation'
import { DemoDataBadge, TradingAccountStatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-xl font-semibold tabular-nums">{value}</p>
    </div>
  )
}

export default async function TradingAccountDetailPage(props: PageProps<'/portal/accounts/[id]'>) {
  const { id } = await props.params
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const { data: account } = await supabase
    .from('trading_accounts')
    .select(
      'id, account_type, status, mt5_login, mt5_server, mt5_group, base_currency, leverage, spread_model, commission_model, balance, equity, credit, used_margin, free_margin, margin_level, requested_at, provisioned_at, rejection_reason',
    )
    .eq('id', id)
    .eq('client_id', profile.id)
    .single()

  if (!account) notFound()

  const money = (value: number) =>
    value.toLocaleString(undefined, { style: 'currency', currency: account.base_currency })

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">
            {account.account_type === 'demo' ? 'Demo' : 'Real'} account {account.mt5_login ?? ''}
          </h1>
          <p className="text-muted-foreground mt-1">
            MT5 · {account.mt5_server ?? 'provisioning…'}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <DemoDataBadge />
          <TradingAccountStatusBadge status={account.status} />
        </div>
      </div>

      {account.status === 'rejected' && account.rejection_reason && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Provisioning failed</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {account.rejection_reason}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Account summary</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-3">
          <Metric label="Balance" value={money(account.balance)} />
          <Metric label="Equity" value={money(account.equity)} />
          <Metric label="Credit" value={money(account.credit)} />
          <Metric label="Used margin" value={money(account.used_margin)} />
          <Metric label="Free margin" value={money(account.free_margin)} />
          <Metric
            label="Margin level"
            value={account.margin_level != null ? `${account.margin_level}%` : '—'}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Trading conditions</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
            <dt className="text-muted-foreground">MT5 login</dt>
            <dd>{account.mt5_login ?? '—'}</dd>
            <dt className="text-muted-foreground">MT5 group</dt>
            <dd>{account.mt5_group ?? '—'}</dd>
            <dt className="text-muted-foreground">Leverage</dt>
            <dd>1:{account.leverage}</dd>
            <dt className="text-muted-foreground">Spread model</dt>
            <dd className="capitalize">{account.spread_model.replace('_', ' ')}</dd>
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
