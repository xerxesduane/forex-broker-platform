import { Info } from 'lucide-react'
import {
  ConfirmDepositButton,
  DepositDialog,
  TransferDialog,
  WithdrawDialog,
} from '@/components/portal/wallet-forms'
import { StatTile } from '@/components/charts/stat-tile'
import { MoneyMovementStatusBadge, SimulatedBadge } from '@/components/status-badge'
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
import { depositMethodLabel, withdrawalMethodLabel } from '@/domain/finance/types'
import { formatAmount } from '@/domain/shared/money'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { loadWallet } from '@/lib/ledger'
import { loadFinanceSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PortalWalletPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const { data: accountState } = await supabase
    .from('profiles')
    .select('account_status, referral_code')
    .eq('id', profile.id)
    .single()

  const [wallet, settings] = await Promise.all([
    loadWallet(supabase, profile.id),
    loadFinanceSettings(supabase),
  ])

  const [{ data: deposits }, { data: withdrawals }, { data: entries }] = await Promise.all([
    supabase
      .from('deposits')
      .select('id, amount, currency, method, status, reference_code, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('withdrawals')
      .select(
        'id, amount, fee, currency, method, status, reference_code, created_at, payout_detail',
      )
      .order('created_at', { ascending: false })
      .limit(20),
    supabase
      .from('ledger_entries')
      .select(
        'id, direction, amount, currency, created_at, compensates_entry_id, transactions!transaction_id(type, external_ref)',
      )
      .order('created_at', { ascending: false })
      .limit(40),
  ])

  const available = wallet?.availableBalance ?? 0
  const accountStatus = (accountState?.account_status as string) ?? 'active'
  const verified = profile.kycStatus === 'approved'
  const restricted = accountStatus !== 'active'

  const fundingDisabled = !verified || restricted
  const fundingReason = !verified
    ? 'Your identity verification must be approved before you can fund your account.'
    : `Funding is unavailable while your account status is "${accountStatus}". Contact support.`

  type EntryRow = {
    id: string
    direction: string
    amount: number
    currency: string
    created_at: string
    compensates_entry_id: string | null
    transactions: { type: string; external_ref: string | null } | null
  }
  const ledgerEntries = ((entries ?? []) as unknown as EntryRow[]).map((row) => ({
    ...row,
    transactions: Array.isArray(row.transactions) ? row.transactions[0] : row.transactions,
  }))

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Your balance is calculated from your transaction history every time this page loads — it
            is never a stored number that could drift from the record.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <SimulatedBadge />
          <DepositDialog
            minimum={settings.depositMin}
            autoCreditLimit={settings.depositAutoCreditLimit}
            disabled={fundingDisabled}
            disabledReason={fundingReason}
          />
          <WithdrawDialog
            available={available}
            minimum={settings.withdrawalMin}
            fee={settings.withdrawalFee}
            dualApprovalThreshold={settings.withdrawalDualApprovalThreshold}
            disabled={fundingDisabled || available <= 0}
            disabledReason={
              fundingDisabled ? fundingReason : 'You have no available balance to withdraw.'
            }
          />
          <TransferDialog
            available={available}
            disabled={fundingDisabled || available <= 0}
            disabledReason={
              fundingDisabled ? fundingReason : 'You have no available balance to transfer.'
            }
          />
        </div>
      </div>

      {fundingDisabled ? (
        <Card className="border-amber-500/50">
          <CardContent className="flex items-start gap-2 p-4 text-sm">
            <Info className="mt-0.5 size-4 shrink-0 text-amber-600" aria-hidden="true" />
            <p>{fundingReason}</p>
          </CardContent>
        </Card>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile
          label="Available balance"
          value={formatAmount(available, wallet?.currency ?? 'USD')}
          hint="ready to trade or withdraw"
        />
        <StatTile
          label="Deposits pending"
          value={formatAmount(wallet?.pendingDeposits ?? 0, 'USD')}
          hint="not yet credited"
        />
        <StatTile
          label="Withdrawals in progress"
          value={formatAmount(wallet?.pendingWithdrawals ?? 0, 'USD')}
          hint="already reserved"
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your client reference</CardTitle>
          <CardDescription>
            Share this with another Aurion client so they can transfer funds to you. It reveals
            nothing else about your account.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <p className="font-mono text-lg font-semibold">{accountState?.referral_code ?? '—'}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Deposits</CardTitle>
        </CardHeader>
        <CardContent>
          {!deposits || deposits.length === 0 ? (
            <p className="text-muted-foreground text-sm">No deposits yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                    <TableHead className="text-right" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deposits.map((deposit) => (
                    <TableRow key={deposit.id}>
                      <TableCell className="font-mono text-xs">{deposit.reference_code}</TableCell>
                      <TableCell>{depositMethodLabel(deposit.method)}</TableCell>
                      <TableCell>
                        <MoneyMovementStatusBadge status={deposit.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(deposit.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatAmount(Number(deposit.amount), deposit.currency)}
                      </TableCell>
                      <TableCell>
                        {deposit.status === 'pending' ? (
                          <div className="flex justify-end">
                            <ConfirmDepositButton depositId={deposit.id} />
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

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Withdrawals</CardTitle>
        </CardHeader>
        <CardContent>
          {!withdrawals || withdrawals.length === 0 ? (
            <p className="text-muted-foreground text-sm">No withdrawals yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Method</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead className="text-right">You receive</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {withdrawals.map((withdrawal) => (
                    <TableRow key={withdrawal.id}>
                      <TableCell className="font-mono text-xs">
                        {withdrawal.reference_code}
                      </TableCell>
                      <TableCell>
                        {withdrawalMethodLabel(withdrawal.method)}
                        <span className="text-muted-foreground block text-xs">
                          {withdrawal.payout_detail}
                        </span>
                      </TableCell>
                      <TableCell>
                        <MoneyMovementStatusBadge status={withdrawal.status} />
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {new Date(withdrawal.created_at).toLocaleDateString()}
                      </TableCell>
                      <TableCell className="text-right font-medium tabular-nums">
                        {formatAmount(
                          Number(withdrawal.amount) - Number(withdrawal.fee),
                          withdrawal.currency,
                        )}
                        <span className="text-muted-foreground block text-xs font-normal">
                          {formatAmount(Number(withdrawal.amount), withdrawal.currency)} less fee
                        </span>
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
          <CardTitle className="text-base">Transaction history</CardTitle>
          <CardDescription>
            Every movement in and out of your wallet, exactly as it is recorded. Nothing here can be
            edited or removed after the fact — a correction appears as its own reversing line.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {ledgerEntries.length === 0 ? (
            <p className="text-muted-foreground text-sm">No transactions yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead className="text-right">Amount</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {ledgerEntries.map((entry) => {
                    // The client's wallet is a liability account, so a credit
                    // is money arriving and a debit is money leaving.
                    const incoming = entry.direction === 'credit'
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(entry.created_at).toLocaleString()}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="capitalize">
                            {entry.transactions?.type?.replace('_', ' ') ?? '—'}
                          </Badge>
                          {entry.compensates_entry_id ? (
                            <Badge variant="secondary" className="ml-1">
                              reversal
                            </Badge>
                          ) : null}
                        </TableCell>
                        <TableCell className="text-muted-foreground max-w-[16rem] truncate font-mono text-xs">
                          {entry.transactions?.external_ref ?? '—'}
                        </TableCell>
                        <TableCell
                          className={
                            incoming
                              ? 'text-right font-medium text-emerald-600 tabular-nums dark:text-emerald-400'
                              : 'text-right font-medium tabular-nums'
                          }
                        >
                          {incoming ? '+' : '−'}
                          {formatAmount(Number(entry.amount), entry.currency)}
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
