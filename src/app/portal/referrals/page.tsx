import { CopyButton, IbApplicationDialog } from '@/components/portal/referral-forms'
import { StatTile } from '@/components/charts/stat-tile'
import { IbStatusBadge, RewardStatusBadge, SimulatedBadge } from '@/components/status-badge'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { rankProgress, type Rank } from '@/domain/growth/commission'
import { formatAmount } from '@/domain/shared/money'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PortalReferralsPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const { data: account } = await supabase
    .from('profiles')
    .select('referral_code, account_status')
    .eq('id', profile.id)
    .single()

  const [{ data: ib }, { data: rankRows }, { data: rebates }] = await Promise.all([
    supabase
      .from('introducing_brokers')
      .select('id, ib_code, status, commission_bps, applied_at')
      .eq('profile_id', profile.id)
      .maybeSingle(),
    supabase.from('ranks').select('id, key, name, min_referred_volume, benefits, sort_order'),
    supabase
      .from('rebates')
      .select('id, amount, currency, status, created_at')
      .order('created_at', { ascending: false })
      .limit(10),
  ])

  const ranks: Rank[] = ((rankRows ?? []) as Record<string, unknown>[])
    .map((row) => ({
      id: row.id as string,
      key: row.key as string,
      name: row.name as string,
      minReferredVolume: Number(row.min_referred_volume),
      benefits: (row.benefits ?? {}) as Rank['benefits'],
      sortOrder: Number(row.sort_order),
    }))
    .sort((a, b) => a.sortOrder - b.sortOrder)

  const [{ data: downline }, { data: commissions }] = ib
    ? await Promise.all([
        supabase.from('referral_relationships').select('referee_id, created_at').eq('ib_id', ib.id),
        supabase
          .from('commissions')
          .select('id, amount, currency, status, created_at')
          .eq('ib_id', ib.id)
          .order('created_at', { ascending: false })
          .limit(20),
      ])
    : [{ data: [] }, { data: [] }]

  const commissionRows = (commissions ?? []) as {
    id: string
    amount: number
    currency: string
    status: string
    created_at: string
  }[]
  const rebateRows = (rebates ?? []) as {
    id: string
    amount: number
    currency: string
    status: string
    created_at: string
  }[]

  const earned = commissionRows.reduce((sum, c) => sum + Number(c.amount), 0)
  const paid = commissionRows
    .filter((c) => c.status === 'paid')
    .reduce((sum, c) => sum + Number(c.amount), 0)
  const pending = earned - paid

  // Referred volume drives the rank; the partner sees the same number the
  // commission engine uses.
  const refereeIds = ((downline ?? []) as { referee_id: string }[]).map((row) => row.referee_id)
  const { data: volumeRows } = refereeIds.length
    ? await supabase.from('deposits').select('amount, client_id').eq('status', 'approved')
    : { data: [] }
  const referredVolume = ((volumeRows ?? []) as { amount: number; client_id: string }[])
    .filter((row) => refereeIds.includes(row.client_id))
    .reduce((sum, row) => sum + Number(row.amount), 0)

  const progress = rankProgress(referredVolume, ranks)
  const referralLink = `https://aurion-markets.example/register?ref=${account?.referral_code ?? ''}`

  const eligible = profile.kycStatus === 'approved' && account?.account_status === 'active'

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Referrals &amp; rewards</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Introduce clients, earn a share of their net deposits, and climb the partner tiers.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <SimulatedBadge />
          {!ib ? (
            <IbApplicationDialog
              disabled={!eligible}
              reason={
                profile.kycStatus !== 'approved'
                  ? 'Complete your identity verification before applying.'
                  : 'Your account must be in good standing to apply.'
              }
            />
          ) : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your referral link</CardTitle>
          <CardDescription>
            Anyone who registers with this link is attributed to you.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <code className="bg-muted min-w-0 flex-1 truncate rounded-md px-3 py-2 text-sm">
              {referralLink}
            </code>
            <CopyButton value={referralLink} label="Copy link" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-sm">Client reference</span>
            <code className="font-mono font-semibold">{account?.referral_code ?? '—'}</code>
            <CopyButton value={account?.referral_code ?? ''} label="Copy code" />
          </div>
        </CardContent>
      </Card>

      {ib ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatTile label="Referred clients" value={String(refereeIds.length)} />
            <StatTile label="Referred deposit volume" value={formatAmount(referredVolume, 'USD')} />
            <StatTile label="Commission earned" value={formatAmount(earned, 'USD')} />
            <StatTile label="Awaiting payout" value={formatAmount(pending, 'USD')} />
          </div>

          <Card>
            <CardHeader className="flex-row items-start justify-between space-y-0">
              <div>
                <CardTitle className="text-base">Partner status</CardTitle>
                <CardDescription>
                  Partner code {ib.ib_code} · applied {new Date(ib.applied_at).toLocaleDateString()}
                </CardDescription>
              </div>
              <IbStatusBadge status={ib.status} />
            </CardHeader>
            <CardContent className="space-y-4">
              {ib.status === 'pending' ? (
                <p className="text-muted-foreground text-sm">
                  Your application is with our partnerships team. You can share your link now — any
                  referrals will be attributed once you are approved.
                </p>
              ) : null}

              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="flex items-center gap-2">
                    {progress.current ? (
                      <Badge variant="secondary">{progress.current.name}</Badge>
                    ) : (
                      <span className="text-muted-foreground">No tier yet</span>
                    )}
                    <span className="text-muted-foreground">
                      {(
                        Number(progress.current?.benefits.commission_bps ?? ib.commission_bps) / 100
                      ).toFixed(2)}
                      % commission
                    </span>
                  </span>
                  {progress.next ? (
                    <span className="text-muted-foreground">
                      {formatAmount(progress.volumeToNext, 'USD')} to {progress.next.name}
                    </span>
                  ) : (
                    <span className="text-muted-foreground">Top tier reached</span>
                  )}
                </div>
                <Progress value={progress.percentToNext} />
              </div>

              <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                {ranks.map((rank) => (
                  <div
                    key={rank.id}
                    className={
                      progress.current?.id === rank.id
                        ? 'border-primary rounded-lg border-2 p-3'
                        : 'rounded-lg border p-3'
                    }
                  >
                    <p className="text-sm font-medium">{rank.name}</p>
                    <p className="text-muted-foreground text-xs">
                      From {formatAmount(rank.minReferredVolume, 'USD')} ·{' '}
                      {((rank.benefits.commission_bps ?? 0) / 100).toFixed(2)}%
                    </p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Commission history</CardTitle>
            </CardHeader>
            <CardContent>
              {commissionRows.length === 0 ? (
                <p className="text-muted-foreground text-sm">
                  No commission yet. It is generated automatically when a referred client&apos;s
                  deposit is credited.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Earned</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {commissionRows.map((commission) => (
                        <TableRow key={commission.id}>
                          <TableCell className="text-muted-foreground text-sm">
                            {new Date(commission.created_at).toLocaleDateString()}
                          </TableCell>
                          <TableCell>
                            <RewardStatusBadge status={commission.status} />
                          </TableCell>
                          <TableCell className="text-right font-medium tabular-nums">
                            {formatAmount(Number(commission.amount), commission.currency)}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Partner programme</CardTitle>
            <CardDescription>
              Four tiers, from Bronze to Platinum. Your rate rises with the deposit volume of the
              clients you introduce.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {ranks.map((rank) => (
                <div key={rank.id} className="rounded-lg border p-3">
                  <p className="font-medium">{rank.name}</p>
                  <p className="text-muted-foreground mt-1 text-sm">
                    {((rank.benefits.commission_bps ?? 0) / 100).toFixed(2)}% of net deposits
                  </p>
                  <p className="text-muted-foreground text-xs">
                    From {formatAmount(rank.minReferredVolume, 'USD')} referred volume
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your deposit rebates</CardTitle>
          <CardDescription>
            A share of every deposit you make, returned to your wallet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {rebateRows.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rebates yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {rebateRows.map((rebate) => (
                <li key={rebate.id} className="flex items-center justify-between gap-3 py-2">
                  <span className="text-muted-foreground">
                    {new Date(rebate.created_at).toLocaleDateString()}
                  </span>
                  <span className="flex items-center gap-2">
                    <RewardStatusBadge status={rebate.status} />
                    <span className="font-medium tabular-nums">
                      {formatAmount(Number(rebate.amount), rebate.currency)}
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
