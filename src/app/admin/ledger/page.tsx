import Link from 'next/link'
import { CheckCircle2, TriangleAlert } from 'lucide-react'
import { PageHeader } from '@/components/admin/page-header'
import { ManualAdjustmentDialog } from '@/components/admin/manual-adjustment-dialog'
import { StatTile } from '@/components/charts/stat-tile'
import { SimulatedBadge } from '@/components/status-badge'
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
import {
  LedgerEntriesTable,
  type LedgerEntryRow,
} from '@/components/admin/ledger-entries-table'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { formatAmount } from '@/domain/shared/money'
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { cn } from '@/lib/utils'

export const dynamic = 'force-dynamic'

const ACCOUNT_KIND_LABEL: Record<string, string> = {
  house: 'House (asset)',
  clearing: 'Clearing (asset in transit)',
  fee_income: 'Fee income',
  client_wallet: 'Client wallet (liability)',
  liability: 'Payable (liability)',
  expense: 'Broker expense',
}

type LedgerAccountBalance = {
  ledger_account_id: string
  key: string | null
  kind: string
  owner_id: string | null
  currency: string
  name: string
  total_debits: number
  total_credits: number
  balance: number
  entry_count: number
}

type EntryRow = {
  id: string
  transaction_id: string
  direction: 'debit' | 'credit'
  amount: number
  currency: string
  created_at: string
  compensates_entry_id: string | null
  ledger_accounts: { name: string; kind: string; key: string | null } | null
  transactions: { type: string; status: string; external_ref: string | null } | null
}

export default async function AdminLedgerPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.LEDGER_VIEW)

  const canAdjust = await hasPermission(supabase, PERMISSIONS.LEDGER_ADJUST)

  const [
    { data: trialBalanceRows },
    { data: accountRows },
    { data: entryRows },
    { data: clientRows },
  ] = await Promise.all([
    supabase
      .from('trial_balance')
      .select('currency, total_debits, total_credits, difference, entry_count'),
    supabase
      .from('ledger_account_balances')
      .select(
        'ledger_account_id, key, kind, owner_id, currency, name, total_debits, total_credits, balance, entry_count',
      )
      .order('kind'),
    supabase
      .from('ledger_entries')
      .select(
        'id, transaction_id, direction, amount, currency, created_at, compensates_entry_id, ledger_accounts!ledger_account_id(name, kind, key), transactions!transaction_id(type, status, external_ref)',
      )
      .order('created_at', { ascending: false })
      // Deliberately wider than the table shows. Corrections are appended,
      // never merged, so a single repair can fill a whole page — pulling a
      // deeper slice keeps every filter below it worth clicking.
      .limit(300),
    supabase
      .from('profiles')
      .select('id, first_name, last_name, email')
      .eq('account_kind', 'client')
      .order('first_name'),
  ])

  const trialBalance = (trialBalanceRows ?? []) as {
    currency: string
    total_debits: number
    total_credits: number
    difference: number
    entry_count: number
  }[]

  const accounts = (accountRows ?? []) as unknown as LedgerAccountBalance[]
  const systemAccounts = accounts.filter((a) => a.kind !== 'client_wallet')
  const clientWallets = accounts
    .filter((a) => a.kind === 'client_wallet')
    .sort((a, b) => Number(b.balance) - Number(a.balance))

  const entries: LedgerEntryRow[] = ((entryRows ?? []) as unknown as EntryRow[]).map((row) => {
    const account = Array.isArray(row.ledger_accounts) ? row.ledger_accounts[0] : row.ledger_accounts
    const transaction = Array.isArray(row.transactions) ? row.transactions[0] : row.transactions
    return {
      id: row.id,
      direction: row.direction,
      amount: Number(row.amount),
      currency: row.currency,
      createdAt: row.created_at,
      isCorrection: row.compensates_entry_id !== null,
      transactionType: transaction?.type ?? null,
      accountName: account?.name ?? null,
      reference: transaction?.external_ref ?? null,
    }
  })

  const clientLiability = clientWallets.reduce((sum, w) => sum + Number(w.balance), 0)
  const feeIncome = systemAccounts
    .filter((a) => a.kind === 'fee_income')
    .reduce((sum, a) => sum + Number(a.balance), 0)
  const clearing = systemAccounts
    .filter((a) => a.kind === 'clearing')
    .reduce((sum, a) => sum + Number(a.balance), 0)
  const payables = systemAccounts
    .filter((a) => a.kind === 'liability')
    .reduce((sum, a) => sum + Number(a.balance), 0)

  const clients = (clientRows ?? []) as {
    id: string
    first_name: string | null
    last_name: string | null
    email: string
  }[]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Wallets & ledger"
        description="Every balance on this page is folded from immutable double-entry rows at read time. Nothing here is a stored balance, and no code path — including a compromised administrator session — can write an unbalanced entry."
        action={
          <div className="flex items-center gap-2">
            <SimulatedBadge />
            {canAdjust ? <ManualAdjustmentDialog clients={clients} /> : null}
          </div>
        }
      />

      {/* The proof panel. This is the claim the rest of the platform rests
          on, so it is stated as a check with a visible pass/fail rather
          than as prose. */}
      {trialBalance.map((row) => {
        const square = Number(row.difference) === 0
        return (
          <Card
            key={row.currency}
            className={cn('border-2', square ? 'border-emerald-500/40' : 'border-red-500/60')}
          >
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-base">
                {square ? (
                  <CheckCircle2 className="size-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <TriangleAlert className="size-4 text-red-600" aria-hidden="true" />
                )}
                Trial balance — {row.currency}
              </CardTitle>
              <CardDescription>
                {square
                  ? `Debits equal credits across all ${Number(row.entry_count).toLocaleString()} entries. The ledger is square.`
                  : 'Debits and credits disagree. This should be impossible — investigate immediately.'}
              </CardDescription>
            </CardHeader>
            <CardContent>
              <dl className="grid gap-4 sm:grid-cols-3">
                <div>
                  <dt className="text-muted-foreground text-sm">Total debits</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {formatAmount(Number(row.total_debits), row.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm">Total credits</dt>
                  <dd className="text-xl font-semibold tabular-nums">
                    {formatAmount(Number(row.total_credits), row.currency)}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-sm">Difference</dt>
                  <dd
                    className={cn(
                      'text-xl font-semibold tabular-nums',
                      square ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600',
                    )}
                  >
                    {formatAmount(Number(row.difference), row.currency)}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        )
      })}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile
          label="Owed to clients"
          value={formatAmount(clientLiability, 'USD')}
          hint="sum of client wallets"
        />
        <StatTile
          label="Withdrawals payable"
          value={formatAmount(payables, 'USD')}
          hint="approved, not yet paid"
        />
        <StatTile label="In clearing" value={formatAmount(clearing, 'USD')} hint="in transit" />
        <StatTile label="Fee income" value={formatAmount(feeIncome, 'USD')} hint="recognised" />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Chart of accounts</CardTitle>
          <CardDescription>
            Debit-normal: what the broker holds (house bank, clearing) and what it has spent
            (broker expense). Credit-normal: what it owes (client wallets, payables) and what it
            has earned (fee income).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Account</TableHead>
                  <TableHead>Kind</TableHead>
                  <TableHead className="text-right">Debits</TableHead>
                  <TableHead className="text-right">Credits</TableHead>
                  <TableHead className="text-right">Balance</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {systemAccounts.map((account) => (
                  <TableRow key={account.ledger_account_id}>
                    <TableCell className="font-medium">{account.name}</TableCell>
                    <TableCell className="text-muted-foreground text-sm">
                      {ACCOUNT_KIND_LABEL[account.kind] ?? account.kind}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(Number(account.total_debits), account.currency)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">
                      {formatAmount(Number(account.total_credits), account.currency)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {formatAmount(Number(account.balance), account.currency)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Client wallets</CardTitle>
          <CardDescription>
            Top balances. Each is the fold of that wallet&apos;s ledger account, computed now.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {clientWallets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No client wallets yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Wallet</TableHead>
                    <TableHead className="text-right">Entries</TableHead>
                    <TableHead className="text-right">Balance</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientWallets.slice(0, 15).map((wallet) => (
                    <TableRow key={wallet.ledger_account_id}>
                      <TableCell>
                        {wallet.owner_id ? (
                          <Link
                            href={`/admin/clients/${wallet.owner_id}`}
                            className="underline-offset-4 hover:underline"
                          >
                            {wallet.name}
                          </Link>
                        ) : (
                          wallet.name
                        )}
                      </TableCell>
                      <TableCell className="text-muted-foreground text-right tabular-nums">
                        {Number(wallet.entry_count)}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatAmount(Number(wallet.balance), wallet.currency)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent ledger entries</CardTitle>
          <CardDescription>
            Append-only. A correction is a new compensating row pointing at the entry it reverses —
            never an edit, which is why corrections accumulate at the top rather than replacing
            anything.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {entries.length === 0 ? (
            <p className="text-muted-foreground text-sm">No entries yet.</p>
          ) : (
            <LedgerEntriesTable entries={entries} />
          )}
        </CardContent>
      </Card>
    </div>
  )
}
