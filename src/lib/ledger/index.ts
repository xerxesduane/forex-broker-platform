import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Posting, SystemLedgerAccounts } from '@/domain/ledger/posting'
import { err, ok, type Result } from '@/domain/shared/result'

const SYSTEM_ACCOUNT_KEYS = {
  houseBank: 'house_bank_usd',
  clearingDeposits: 'clearing_deposits_usd',
  clearingWithdrawals: 'clearing_withdrawals_usd',
  feeIncome: 'fee_income_usd',
} as const

/**
 * Resolve the house chart of accounts by stable key. Throws rather than
 * returning a partial map: a posting built against a missing system
 * account would be a silently mis-booked transaction.
 */
export async function loadSystemLedgerAccounts(
  supabase: SupabaseClient,
): Promise<SystemLedgerAccounts> {
  const { data, error } = await supabase
    .from('ledger_accounts')
    .select('id, key')
    .in('key', Object.values(SYSTEM_ACCOUNT_KEYS))

  if (error) {
    throw new Error(`Could not load system ledger accounts: ${error.message}`)
  }

  const byKey = new Map((data ?? []).map((row) => [row.key as string, row.id as string]))
  const resolved: Partial<SystemLedgerAccounts> = {}
  for (const [field, key] of Object.entries(SYSTEM_ACCOUNT_KEYS)) {
    const id = byKey.get(key)
    if (!id) {
      throw new Error(`System ledger account "${key}" is missing — run the finance migration.`)
    }
    resolved[field as keyof SystemLedgerAccounts] = id
  }
  return resolved as SystemLedgerAccounts
}

export type PostingFailure = { code: 'posting_rejected'; message: string }

/**
 * Hand a validated posting to the database's post_transaction() gateway.
 *
 * The posting has already been checked in TypeScript
 * (src/domain/ledger/posting.ts); this call is checked again in SQL. Both
 * layers must agree before a ledger row exists, and the SQL layer is the
 * one that cannot be bypassed (ADR 0003).
 */
export async function postTransaction(
  serviceRoleClient: SupabaseClient,
  input: {
    type:
      | 'deposit'
      | 'withdrawal'
      | 'internal_transfer'
      | 'fee'
      | 'commission'
      | 'rebate'
      | 'adjustment'
    posting: Posting
    idempotencyKey?: string
    externalRef?: string
    /** Backdates the posting; defaults to now. Used by the demo seed. */
    occurredAt?: string
  },
): Promise<Result<string, PostingFailure>> {
  const { data, error } = await serviceRoleClient.rpc('post_transaction', {
    p_type: input.type,
    p_currency: input.posting.currency,
    p_idempotency_key: input.idempotencyKey ?? randomUUID(),
    p_legs: input.posting.legs.map((leg) => ({
      ledger_account_id: leg.ledgerAccountId,
      direction: leg.direction,
      amount: leg.amount,
    })),
    p_external_ref: input.externalRef ?? input.posting.memo,
    p_occurred_at: input.occurredAt ?? null,
  })

  if (error || typeof data !== 'string') {
    return err({
      code: 'posting_rejected',
      message: error?.message ?? 'The ledger refused this posting.',
    })
  }
  return ok(data)
}

/** Reverse a posted transaction with compensating entries. */
export async function reverseTransaction(
  serviceRoleClient: SupabaseClient,
  input: { transactionId: string; idempotencyKey?: string },
): Promise<Result<string, PostingFailure>> {
  const { data, error } = await serviceRoleClient.rpc('reverse_transaction', {
    p_transaction_id: input.transactionId,
    p_idempotency_key: input.idempotencyKey ?? randomUUID(),
  })

  if (error || typeof data !== 'string') {
    return err({
      code: 'posting_rejected',
      message: error?.message ?? 'The ledger refused this reversal.',
    })
  }
  return ok(data)
}

export type WalletSummary = {
  walletId: string
  clientId: string
  currency: string
  ledgerAccountId: string
  availableBalance: number
  pendingDeposits: number
  pendingWithdrawals: number
}

/** The client's wallet, with its balance folded from the ledger. */
export async function loadWallet(
  supabase: SupabaseClient,
  clientId: string,
  currency = 'USD',
): Promise<WalletSummary | null> {
  const { data } = await supabase
    .from('wallet_balances')
    .select(
      'wallet_id, client_id, currency, ledger_account_id, available_balance, pending_deposits, pending_withdrawals',
    )
    .eq('client_id', clientId)
    .eq('currency', currency)
    .maybeSingle()

  if (!data) return null

  return {
    walletId: data.wallet_id as string,
    clientId: data.client_id as string,
    currency: data.currency as string,
    ledgerAccountId: data.ledger_account_id as string,
    availableBalance: Number(data.available_balance ?? 0),
    pendingDeposits: Number(data.pending_deposits ?? 0),
    pendingWithdrawals: Number(data.pending_withdrawals ?? 0),
  }
}
