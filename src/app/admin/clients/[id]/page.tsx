import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { AuditTimeline, type AuditEventRow } from '@/components/admin/audit-timeline'
import { AddClientNoteForm, ClientStatusDialog } from '@/components/admin/client-controls'
import { PageHeader } from '@/components/admin/page-header'
import { StatTile } from '@/components/charts/stat-tile'
import {
  ClientStatusBadge,
  KycStatusBadge,
  MoneyMovementStatusBadge,
  RiskBadge,
  SimulatedBadge,
  TradingAccountStatusBadge,
} from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { formatAmount } from '@/domain/shared/money'
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const AUDIT_SELECT =
  'id, action, entity_type, reason, correlation_id, actor_role, created_at, before_state, after_state'

export default async function AdminClientDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.CLIENT_VIEW)

  const [canManage, canSeeMoney] = await Promise.all([
    hasPermission(supabase, PERMISSIONS.CLIENT_MANAGE),
    hasPermission(supabase, PERMISSIONS.WALLET_VIEW),
  ])

  const { data: client } = await supabase
    .from('profiles')
    .select(
      'id, first_name, last_name, email, kyc_status, account_status, risk_rating, referral_code, phone_number, country_of_residence, city, address_line1, postal_code, date_of_birth, profile_completed_at, created_at, last_login_at, two_factor_enabled',
    )
    .eq('id', id)
    .eq('account_kind', 'client')
    .maybeSingle()

  if (!client) notFound()

  const [
    { data: kycCases },
    { data: accounts },
    { data: deposits },
    { data: withdrawals },
    { data: tickets },
    { data: notes },
    { data: wallet },
  ] = await Promise.all([
    supabase
      .from('kyc_cases')
      .select('id, status, submitted_at, decided_at, decision_reason')
      .eq('client_id', id)
      .order('submitted_at', { ascending: false }),
    supabase
      .from('trading_accounts')
      .select(
        'id, account_type, status, mt5_login, mt5_server, base_currency, leverage, balance, equity, requested_at',
      )
      .eq('client_id', id)
      .order('requested_at', { ascending: false }),
    canSeeMoney
      ? supabase
          .from('deposits')
          .select('id, amount, currency, method, status, reference_code, created_at')
          .eq('client_id', id)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    canSeeMoney
      ? supabase
          .from('withdrawals')
          .select('id, amount, fee, currency, method, status, reference_code, created_at')
          .eq('client_id', id)
          .order('created_at', { ascending: false })
          .limit(20)
      : Promise.resolve({ data: [] }),
    supabase
      .from('support_tickets')
      .select('id, subject, status, priority, reference_code, updated_at')
      .eq('client_id', id)
      .order('updated_at', { ascending: false })
      .limit(10),
    supabase
      .from('client_notes')
      .select(
        'id, body, author_role, pinned, created_at, profiles!author_id(first_name, last_name)',
      )
      .eq('client_id', id)
      .order('created_at', { ascending: false })
      .limit(20),
    canSeeMoney
      ? supabase
          .from('wallet_balances')
          .select('available_balance, currency, pending_deposits, pending_withdrawals')
          .eq('client_id', id)
          .maybeSingle()
      : Promise.resolve({ data: null }),
  ])

  const kycCaseIds = (kycCases ?? []).map((c) => c.id as string)
  const accountIds = (accounts ?? []).map((a) => a.id as string)
  const depositIds = ((deposits ?? []) as { id: string }[]).map((d) => d.id)
  const withdrawalIds = ((withdrawals ?? []) as { id: string }[]).map((w) => w.id)

  const emptyAudit = Promise.resolve({ data: [] as AuditEventRow[] })
  const auditFor = (entityType: string, ids: string[]) =>
    ids.length
      ? supabase
          .from('audit_events')
          .select(AUDIT_SELECT)
          .eq('entity_type', entityType)
          .in('entity_id', ids)
      : emptyAudit

  const [profileEvents, kycEvents, accountEvents, depositEvents, withdrawalEvents] =
    await Promise.all([
      supabase
        .from('audit_events')
        .select(AUDIT_SELECT)
        .eq('entity_type', 'profile')
        .eq('entity_id', id),
      auditFor('kyc_case', kycCaseIds),
      auditFor('trading_account', accountIds),
      auditFor('deposit', depositIds),
      auditFor('withdrawal', withdrawalIds),
    ])

  const timeline = [
    ...((profileEvents.data ?? []) as AuditEventRow[]),
    ...((kycEvents.data ?? []) as AuditEventRow[]),
    ...((accountEvents.data ?? []) as AuditEventRow[]),
    ...((depositEvents.data ?? []) as AuditEventRow[]),
    ...((withdrawalEvents.data ?? []) as AuditEventRow[]),
  ].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  const fullName = `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() || client.email

  type NoteRow = {
    id: string
    body: string
    author_role: string
    pinned: boolean
    created_at: string
    profiles: { first_name: string | null; last_name: string | null } | null
  }
  const clientNotes = ((notes ?? []) as unknown as NoteRow[]).map((row) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
  }))

  const walletRow = wallet as {
    available_balance: number
    currency: string
    pending_deposits: number
    pending_withdrawals: number
  } | null

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        render={
          <Link href="/admin/clients">
            <ArrowLeft className="mr-1 size-3.5" /> Back to clients
          </Link>
        }
      />

      <PageHeader
        title={fullName}
        description={`${client.email} · client reference ${client.referral_code ?? '—'}`}
        action={
          <div className="flex flex-wrap items-center gap-2">
            <KycStatusBadge status={client.kyc_status} />
            <ClientStatusBadge status={client.account_status} />
            <RiskBadge status={client.risk_rating} />
            {canManage ? (
              <ClientStatusDialog
                clientId={client.id}
                accountStatus={client.account_status}
                riskRating={client.risk_rating}
              />
            ) : null}
          </div>
        }
      />

      {canSeeMoney ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Wallet balance"
            value={formatAmount(
              Number(walletRow?.available_balance ?? 0),
              walletRow?.currency ?? 'USD',
            )}
            hint="ledger-derived"
          />
          <StatTile
            label="Deposits pending"
            value={formatAmount(Number(walletRow?.pending_deposits ?? 0), 'USD')}
          />
          <StatTile
            label="Withdrawals in flight"
            value={formatAmount(Number(walletRow?.pending_withdrawals ?? 0), 'USD')}
            hint="already reserved"
          />
          <StatTile label="Trading accounts" value={String(accounts?.length ?? 0)} />
        </div>
      ) : null}

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="accounts">Accounts</TabsTrigger>
          {canSeeMoney ? <TabsTrigger value="money">Money</TabsTrigger> : null}
          <TabsTrigger value="support">Support</TabsTrigger>
          <TabsTrigger value="notes">Internal notes</TabsTrigger>
          <TabsTrigger value="audit">Audit trail</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-4 space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Profile</CardTitle>
              <CardDescription>Fictional demo identity — no real personal data.</CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid grid-cols-2 gap-y-2 text-sm sm:grid-cols-4">
                <dt className="text-muted-foreground">Date of birth</dt>
                <dd>{client.date_of_birth ?? '—'}</dd>
                <dt className="text-muted-foreground">Phone</dt>
                <dd>{client.phone_number || '—'}</dd>
                <dt className="text-muted-foreground">Country</dt>
                <dd>{client.country_of_residence || '—'}</dd>
                <dt className="text-muted-foreground">City</dt>
                <dd>{client.city || '—'}</dd>
                <dt className="text-muted-foreground">Address</dt>
                <dd>{client.address_line1 || '—'}</dd>
                <dt className="text-muted-foreground">Postal code</dt>
                <dd>{client.postal_code || '—'}</dd>
                <dt className="text-muted-foreground">Two-factor</dt>
                <dd>{client.two_factor_enabled ? 'Enabled' : 'Not enabled'}</dd>
                <dt className="text-muted-foreground">Registered</dt>
                <dd>{new Date(client.created_at).toLocaleDateString()}</dd>
                <dt className="text-muted-foreground">Last sign-in</dt>
                <dd>
                  {client.last_login_at ? new Date(client.last_login_at).toLocaleString() : 'Never'}
                </dd>
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Verification history</CardTitle>
            </CardHeader>
            <CardContent>
              {!kycCases || kycCases.length === 0 ? (
                <p className="text-muted-foreground text-sm">No KYC submissions yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {kycCases.map((kycCase) => (
                    <li key={kycCase.id} className="flex items-start justify-between gap-3 py-2">
                      <div>
                        <Link
                          href={`/admin/kyc/${kycCase.id}`}
                          className="underline-offset-4 hover:underline"
                        >
                          {kycCase.submitted_at
                            ? new Date(kycCase.submitted_at).toLocaleString()
                            : '—'}
                        </Link>
                        {kycCase.decision_reason ? (
                          <p className="text-muted-foreground text-xs">{kycCase.decision_reason}</p>
                        ) : null}
                      </div>
                      <KycStatusBadge status={kycCase.status} />
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="accounts" className="mt-4">
          <Card>
            <CardHeader className="flex-row items-center justify-between space-y-0">
              <CardTitle className="text-base">Trading accounts</CardTitle>
              <SimulatedBadge />
            </CardHeader>
            <CardContent>
              {!accounts || accounts.length === 0 ? (
                <p className="text-muted-foreground text-sm">No trading accounts yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {accounts.map((account) => (
                    <li key={account.id} className="flex items-start justify-between gap-3 py-3">
                      <div>
                        <p className="font-medium capitalize">
                          {account.account_type} · {account.mt5_login ?? 'provisioning…'}
                        </p>
                        <p className="text-muted-foreground text-xs">
                          {account.mt5_server ?? 'server pending'} · 1:{account.leverage} ·{' '}
                          {account.base_currency}
                        </p>
                      </div>
                      <div className="text-right">
                        <TradingAccountStatusBadge status={account.status} />
                        <p className="mt-1 text-xs tabular-nums">
                          {formatAmount(Number(account.balance), account.base_currency)} balance
                        </p>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {canSeeMoney ? (
          <TabsContent value="money" className="mt-4 space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Deposits</CardTitle>
              </CardHeader>
              <CardContent>
                {(deposits ?? []).length === 0 ? (
                  <p className="text-muted-foreground text-sm">No deposits yet.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {(
                      deposits as {
                        id: string
                        amount: number
                        currency: string
                        method: string
                        status: string
                        reference_code: string | null
                        created_at: string
                      }[]
                    ).map((deposit) => (
                      <li key={deposit.id} className="flex items-center justify-between gap-3 py-2">
                        <span className="text-muted-foreground font-mono text-xs">
                          {deposit.reference_code} ·{' '}
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

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Withdrawals</CardTitle>
              </CardHeader>
              <CardContent>
                {(withdrawals ?? []).length === 0 ? (
                  <p className="text-muted-foreground text-sm">No withdrawals yet.</p>
                ) : (
                  <ul className="divide-y text-sm">
                    {(
                      withdrawals as {
                        id: string
                        amount: number
                        fee: number
                        currency: string
                        status: string
                        reference_code: string | null
                        created_at: string
                      }[]
                    ).map((withdrawal) => (
                      <li
                        key={withdrawal.id}
                        className="flex items-center justify-between gap-3 py-2"
                      >
                        <span className="text-muted-foreground font-mono text-xs">
                          {withdrawal.reference_code} ·{' '}
                          {new Date(withdrawal.created_at).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-2">
                          <MoneyMovementStatusBadge status={withdrawal.status} />
                          <span className="font-medium tabular-nums">
                            {formatAmount(Number(withdrawal.amount), withdrawal.currency)}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        ) : null}

        <TabsContent value="support" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Support tickets</CardTitle>
            </CardHeader>
            <CardContent>
              {(tickets ?? []).length === 0 ? (
                <p className="text-muted-foreground text-sm">No tickets from this client.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {(
                    tickets as {
                      id: string
                      subject: string
                      status: string
                      reference_code: string | null
                      updated_at: string
                    }[]
                  ).map((ticket) => (
                    <li key={ticket.id} className="flex items-center justify-between gap-3 py-2">
                      <Link
                        href={`/admin/support/${ticket.id}`}
                        className="truncate underline-offset-4 hover:underline"
                      >
                        {ticket.subject}
                      </Link>
                      <span className="text-muted-foreground shrink-0 font-mono text-xs">
                        {ticket.reference_code}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="notes" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Internal notes</CardTitle>
              <CardDescription>
                Staff-only. There is no row-level policy that would let a client read these.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {canManage ? <AddClientNoteForm clientId={client.id} /> : null}
              {clientNotes.length === 0 ? (
                <p className="text-muted-foreground text-sm">No notes yet.</p>
              ) : (
                <ul className="divide-y text-sm">
                  {clientNotes.map((note) => (
                    <li key={note.id} className="py-3">
                      <p className="text-muted-foreground mb-1 text-xs">
                        {`${note.profiles?.first_name ?? ''} ${note.profiles?.last_name ?? ''}`.trim() ||
                          note.author_role}{' '}
                        · {new Date(note.created_at).toLocaleString()}
                      </p>
                      <p className="whitespace-pre-wrap">{note.body}</p>
                    </li>
                  ))}
                </ul>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Complete timeline &amp; audit evidence</CardTitle>
              <CardDescription>
                Every row carries an actor, a reason where the action was a decision, and a
                correlation id. Append-only — the database refuses updates and deletes outright.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <AuditTimeline events={timeline} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}
