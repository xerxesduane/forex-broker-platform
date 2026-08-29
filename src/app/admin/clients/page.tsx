import Link from 'next/link'
import { PageHeader } from '@/components/admin/page-header'
import { StatTile } from '@/components/charts/stat-tile'
import { ClientStatusBadge, KycStatusBadge, RiskBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
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

type ClientRow = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
  kyc_status: string
  account_status: string
  risk_rating: string
  referral_code: string | null
  country_of_residence: string | null
  created_at: string
  last_login_at: string | null
}

export default async function AdminClientsPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; kyc?: string; status?: string }>
}) {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.CLIENT_VIEW)

  const filters = await searchParams
  const search = (filters.q ?? '').trim()

  let query = supabase
    .from('profiles')
    .select(
      'id, first_name, last_name, email, kyc_status, account_status, risk_rating, referral_code, country_of_residence, created_at, last_login_at',
    )
    .eq('account_kind', 'client')
    .order('created_at', { ascending: false })
    .limit(200)

  if (search) {
    // Escape the PostgREST `or` separator so a comma in the search box
    // cannot smuggle in an extra filter condition.
    const safe = search.replace(/[,()]/g, ' ')
    query = query.or(
      `first_name.ilike.%${safe}%,last_name.ilike.%${safe}%,email.ilike.%${safe}%,referral_code.ilike.%${safe}%`,
    )
  }
  if (filters.kyc) query = query.eq('kyc_status', filters.kyc)
  if (filters.status) query = query.eq('account_status', filters.status)

  const { data } = await query
  const clients = (data ?? []) as ClientRow[]

  // Wallet balances need wallet.view; a support agent who lacks it still
  // gets the rest of the page rather than an error.
  const canSeeBalances = await hasPermission(supabase, PERMISSIONS.WALLET_VIEW)
  const balanceByClient = new Map<string, number>()
  if (canSeeBalances) {
    const { data: wallets } = await supabase
      .from('wallet_balances')
      .select('client_id, available_balance')
    for (const wallet of (wallets ?? []) as { client_id: string; available_balance: number }[]) {
      balanceByClient.set(wallet.client_id, Number(wallet.available_balance))
    }
  }

  const verified = clients.filter((c) => c.kyc_status === 'approved').length
  const restricted = clients.filter((c) => c.account_status !== 'active').length
  const highRisk = clients.filter((c) => c.risk_rating === 'high').length

  return (
    <div className="space-y-6">
      <PageHeader
        title="Clients"
        description="Every client record, with the verification, restriction and risk state operations owns."
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Clients shown" value={String(clients.length)} />
        <StatTile label="Fully verified" value={String(verified)} />
        <StatTile label="Restricted or suspended" value={String(restricted)} />
        <StatTile label="High risk" value={String(highRisk)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Search &amp; filter</CardTitle>
          <CardDescription>Filters run as a server query — no client-side slicing.</CardDescription>
        </CardHeader>
        <CardContent>
          <form className="flex flex-wrap items-end gap-3" method="get">
            <div className="min-w-[16rem] flex-1 space-y-1.5">
              <label htmlFor="q" className="text-sm font-medium">
                Name, email or client reference
              </label>
              <Input
                id="q"
                name="q"
                defaultValue={search}
                placeholder="e.g. Nakamura or AM-4F2C91"
              />
            </div>
            <div className="space-y-1.5">
              <label htmlFor="kyc" className="text-sm font-medium">
                Verification
              </label>
              <select
                id="kyc"
                name="kyc"
                defaultValue={filters.kyc ?? ''}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option value="">Any</option>
                <option value="not_started">Not started</option>
                <option value="submitted">Submitted</option>
                <option value="in_review">In review</option>
                <option value="needs_revision">Needs revision</option>
                <option value="approved">Approved</option>
                <option value="rejected">Rejected</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <label htmlFor="status" className="text-sm font-medium">
                Account status
              </label>
              <select
                id="status"
                name="status"
                defaultValue={filters.status ?? ''}
                className="border-input bg-background h-9 rounded-md border px-3 text-sm"
              >
                <option value="">Any</option>
                <option value="active">Active</option>
                <option value="restricted">Restricted</option>
                <option value="suspended">Suspended</option>
                <option value="closed">Closed</option>
              </select>
            </div>
            <button
              type="submit"
              className="bg-primary text-primary-foreground h-9 rounded-md px-4 text-sm font-medium"
            >
              Apply
            </button>
            {search || filters.kyc || filters.status ? (
              <Link
                href="/admin/clients"
                className="text-muted-foreground h-9 px-2 text-sm leading-9 underline"
              >
                Clear
              </Link>
            ) : null}
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {clients.length} client{clients.length === 1 ? '' : 's'}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {clients.length === 0 ? (
            <p className="text-muted-foreground text-sm">Nothing matches those filters.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Country</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Risk</TableHead>
                    {canSeeBalances ? <TableHead className="text-right">Wallet</TableHead> : null}
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {client.first_name || client.last_name
                            ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
                            : '(profile incomplete)'}
                        </Link>
                        <p className="text-muted-foreground text-xs">{client.email}</p>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {client.referral_code ?? '—'}
                      </TableCell>
                      <TableCell className="text-sm">
                        {client.country_of_residence ?? '—'}
                      </TableCell>
                      <TableCell>
                        <KycStatusBadge status={client.kyc_status} />
                      </TableCell>
                      <TableCell>
                        <ClientStatusBadge status={client.account_status} />
                      </TableCell>
                      <TableCell>
                        <RiskBadge status={client.risk_rating} />
                      </TableCell>
                      {canSeeBalances ? (
                        <TableCell className="text-right tabular-nums">
                          {formatAmount(balanceByClient.get(client.id) ?? 0, 'USD')}
                        </TableCell>
                      ) : null}
                      <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                        {new Date(client.created_at).toLocaleDateString()}
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
