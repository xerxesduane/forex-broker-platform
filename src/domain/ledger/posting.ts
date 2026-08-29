/**
 * Double-entry posting builders.
 *
 * Every money movement in the platform is expressed here as a set of legs
 * that must sum to zero, and nowhere else. The database's
 * post_transaction() function re-checks the same invariant (see
 * supabase/migrations/...finance_activation.sql) — this module exists so
 * the rule is *also* enforced in typed, unit-tested code that runs
 * without a database, and so each movement's chart-of-accounts shape is
 * written down once instead of being reinvented per server action.
 *
 * Sign conventions (standard accounting, applied consistently):
 *   client wallet  — liability to the client. Credit increases it.
 *   fee income     — income.               Credit increases it.
 *   house bank     — asset.                Debit increases it.
 *   clearing       — asset in transit.     Debit increases it.
 */
import {
  add,
  fromMinorUnits,
  isPositive,
  subtract,
  toMajorUnits,
  zero,
  type Money,
} from '@/domain/shared/money'
import { err, ok, type Result } from '@/domain/shared/result'

export type LedgerDirection = 'debit' | 'credit'

/** A single side of a posting, ready to hand to post_transaction(). */
export type PostingLeg = {
  ledgerAccountId: string
  direction: LedgerDirection
  /** Major units, matching the numeric(18,2) column. */
  amount: number
}

export type Posting = {
  legs: PostingLeg[]
  currency: string
  /** Human-readable description of what this posting represents. */
  memo: string
}

export type PostingError = {
  code: 'unbalanced' | 'empty' | 'non_positive_leg' | 'insufficient_funds' | 'same_account'
  message: string
}

/** The system ledger accounts a posting may reference, resolved by key. */
export type SystemLedgerAccounts = {
  houseBank: string
  clearingDeposits: string
  clearingWithdrawals: string
  feeIncome: string
}

function debit(ledgerAccountId: string, amount: Money): PostingLeg {
  return { ledgerAccountId, direction: 'debit', amount: toMajorUnits(amount) }
}

function credit(ledgerAccountId: string, amount: Money): PostingLeg {
  return { ledgerAccountId, direction: 'credit', amount: toMajorUnits(amount) }
}

/**
 * The invariant, in one place: a posting is valid only if it has at least
 * two legs, every leg is strictly positive, and debits equal credits to
 * the cent. Callers must run this before posting — and the database will
 * reject anything that slips through anyway.
 */
export function validatePosting(posting: Posting): Result<Posting, PostingError> {
  if (posting.legs.length < 2) {
    return err({
      code: 'empty',
      message: `A double-entry posting needs at least two legs, got ${posting.legs.length}.`,
    })
  }

  let debits = zero(posting.currency)
  let credits = zero(posting.currency)

  for (const leg of posting.legs) {
    const legAmount = fromMinorUnits(Math.round(leg.amount * 100), posting.currency)
    if (!isPositive(legAmount)) {
      return err({
        code: 'non_positive_leg',
        message: `Every leg must be a positive amount; got ${leg.amount} on account ${leg.ledgerAccountId}.`,
      })
    }
    if (leg.direction === 'debit') debits = add(debits, legAmount)
    else credits = add(credits, legAmount)
  }

  const difference = subtract(debits, credits)
  if (difference.minorUnits !== 0) {
    return err({
      code: 'unbalanced',
      message: `Unbalanced posting: debits ${toMajorUnits(debits)} ≠ credits ${toMajorUnits(credits)} (out by ${toMajorUnits(difference)}).`,
    })
  }

  return ok(posting)
}

/**
 * Client funds arrive. The money is already in a clearing account (the
 * payment provider has confirmed it), and becomes the broker's liability
 * to the client.
 */
export function buildDepositPosting(input: {
  clientLedgerAccountId: string
  system: SystemLedgerAccounts
  amount: Money
}): Result<Posting, PostingError> {
  return validatePosting({
    currency: input.amount.currency,
    memo: 'Client deposit — clearing to client wallet',
    legs: [
      debit(input.system.clearingDeposits, input.amount),
      credit(input.clientLedgerAccountId, input.amount),
    ],
  })
}

/**
 * A withdrawal *request* reserves the money the moment it is made: the
 * client's wallet is debited the gross amount, the net goes to a
 * withdrawals clearing account, and the fee is recognised as income.
 * A rejection later is a reversal of this posting, never a deletion —
 * which is why the reservation is real ledger activity rather than a
 * "reserved_balance" column.
 */
export function buildWithdrawalReservationPosting(input: {
  clientLedgerAccountId: string
  system: SystemLedgerAccounts
  grossAmount: Money
  fee: Money
}): Result<Posting, PostingError> {
  const net = subtract(input.grossAmount, input.fee)
  if (!isPositive(net)) {
    return err({
      code: 'non_positive_leg',
      message: `A withdrawal of ${toMajorUnits(input.grossAmount)} does not cover the ${toMajorUnits(input.fee)} fee.`,
    })
  }

  const legs = [
    debit(input.clientLedgerAccountId, input.grossAmount),
    credit(input.system.clearingWithdrawals, net),
  ]
  if (isPositive(input.fee)) {
    legs.push(credit(input.system.feeIncome, input.fee))
  }

  return validatePosting({
    currency: input.grossAmount.currency,
    memo: 'Withdrawal requested — client wallet reserved, fee recognised',
    legs,
  })
}

/** The payout actually leaves the house: clearing drains to the bank. */
export function buildWithdrawalPayoutPosting(input: {
  system: SystemLedgerAccounts
  netAmount: Money
}): Result<Posting, PostingError> {
  return validatePosting({
    currency: input.netAmount.currency,
    memo: 'Withdrawal paid — withdrawals clearing to house bank',
    legs: [
      debit(input.system.houseBank, input.netAmount),
      credit(input.system.clearingWithdrawals, input.netAmount),
    ],
  })
}

/** Wallet to wallet, same currency. Both sides are client liabilities. */
export function buildInternalTransferPosting(input: {
  fromLedgerAccountId: string
  toLedgerAccountId: string
  amount: Money
  availableBalance: Money
}): Result<Posting, PostingError> {
  if (input.fromLedgerAccountId === input.toLedgerAccountId) {
    return err({ code: 'same_account', message: 'Cannot transfer to the same wallet.' })
  }
  if (subtract(input.availableBalance, input.amount).minorUnits < 0) {
    return err({
      code: 'insufficient_funds',
      message: `Transfer of ${toMajorUnits(input.amount)} exceeds the available balance of ${toMajorUnits(input.availableBalance)}.`,
    })
  }

  return validatePosting({
    currency: input.amount.currency,
    memo: 'Internal transfer between client wallets',
    legs: [
      debit(input.fromLedgerAccountId, input.amount),
      credit(input.toLedgerAccountId, input.amount),
    ],
  })
}

/** IB commission: paid out of house funds into the partner's wallet. */
export function buildCommissionPayoutPosting(input: {
  ibLedgerAccountId: string
  system: SystemLedgerAccounts
  amount: Money
}): Result<Posting, PostingError> {
  return validatePosting({
    currency: input.amount.currency,
    memo: 'Introducing broker commission paid to partner wallet',
    legs: [
      debit(input.system.houseBank, input.amount),
      credit(input.ibLedgerAccountId, input.amount),
    ],
  })
}

/** Client rebate: also house-funded, into the client's own wallet. */
export function buildRebatePosting(input: {
  clientLedgerAccountId: string
  system: SystemLedgerAccounts
  amount: Money
}): Result<Posting, PostingError> {
  return validatePosting({
    currency: input.amount.currency,
    memo: 'Client rebate credited',
    legs: [
      debit(input.system.houseBank, input.amount),
      credit(input.clientLedgerAccountId, input.amount),
    ],
  })
}

/**
 * A manual correction by a finance approver. Still double-entry, still
 * against the house — there is no "just set the balance" path anywhere in
 * this system, for anyone (ADR 0003).
 */
export function buildManualAdjustmentPosting(input: {
  clientLedgerAccountId: string
  system: SystemLedgerAccounts
  amount: Money
  direction: 'credit_client' | 'debit_client'
}): Result<Posting, PostingError> {
  const legs =
    input.direction === 'credit_client'
      ? [
          debit(input.system.houseBank, input.amount),
          credit(input.clientLedgerAccountId, input.amount),
        ]
      : [
          debit(input.clientLedgerAccountId, input.amount),
          credit(input.system.houseBank, input.amount),
        ]

  return validatePosting({
    currency: input.amount.currency,
    memo: `Manual adjustment (${input.direction.replace('_', ' ')})`,
    legs,
  })
}
