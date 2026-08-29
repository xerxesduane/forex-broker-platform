/**
 * Withdrawal lifecycle, including the maker-checker rule.
 *
 * Two independent controls live here:
 *
 *   1. Funds are reserved at *request* time by a real ledger posting (see
 *      buildWithdrawalReservationPosting), so a client cannot spend the
 *      same balance twice while a withdrawal is queued.
 *   2. Above finance.withdrawal_dual_approval_threshold a withdrawal needs
 *      two distinct approvers. The same member of staff signing twice is
 *      refused here, in the database (unique (withdrawal_id, approver_id))
 *      and in the server action — three layers, because this is the
 *      control an auditor will ask about.
 */
import { fromMajorUnits, gte, subtract, type Money } from '@/domain/shared/money'
import { err, ok, type Result } from '@/domain/shared/result'
import type { FinanceSettings, MoneyMovementStatus, WithdrawalEvent } from './types'

export type WithdrawalTransitionError = {
  code: 'invalid_transition'
  message: string
  from: MoneyMovementStatus
  event: WithdrawalEvent['type']
}

const TRANSITIONS: Record<
  MoneyMovementStatus,
  Partial<Record<WithdrawalEvent['type'], MoneyMovementStatus>>
> = {
  pending: { APPROVE: 'approved', REJECT: 'rejected', FAIL: 'failed' },
  approved: { MARK_PAID: 'paid', FAIL: 'failed', REJECT: 'rejected' },
  paid: {},
  rejected: {},
  confirmed: {},
  failed: {},
  reversed: {},
}

export function transitionWithdrawal(
  current: MoneyMovementStatus,
  event: WithdrawalEvent,
): Result<MoneyMovementStatus, WithdrawalTransitionError> {
  const next = TRANSITIONS[current][event.type]
  if (!next) {
    return err({
      code: 'invalid_transition',
      message: `Cannot apply ${event.type} to a withdrawal in status "${current}".`,
      from: current,
      event: event.type,
    })
  }
  return ok(next)
}

export type WithdrawalRequestError = {
  code: 'below_minimum' | 'insufficient_funds' | 'account_restricted' | 'fee_exceeds_amount'
  message: string
}

export type WithdrawalQuote = {
  gross: Money
  fee: Money
  net: Money
  requiresDualApproval: boolean
}

/**
 * Validate a withdrawal request and return exactly what the client will
 * receive. The quote is computed once, here, and reused by the posting
 * builder and the UI so the number a client is shown is the number that
 * hits the ledger.
 */
export function quoteWithdrawal(input: {
  amount: Money
  availableBalance: Money
  settings: FinanceSettings
  accountStatus: string
}): Result<WithdrawalQuote, WithdrawalRequestError> {
  if (input.accountStatus !== 'active') {
    return err({
      code: 'account_restricted',
      message: `Withdrawals are unavailable while the account status is "${input.accountStatus}". Contact support.`,
    })
  }

  const minimum = fromMajorUnits(input.settings.withdrawalMin, input.amount.currency)
  if (!gte(input.amount, minimum)) {
    return err({
      code: 'below_minimum',
      message: `The minimum withdrawal is ${input.settings.withdrawalMin} ${input.amount.currency}.`,
    })
  }

  const fee = fromMajorUnits(input.settings.withdrawalFee, input.amount.currency)
  const net = subtract(input.amount, fee)
  if (net.minorUnits <= 0) {
    return err({
      code: 'fee_exceeds_amount',
      message: `A ${input.settings.withdrawalFee} ${input.amount.currency} fee applies, so the withdrawal must be larger than that.`,
    })
  }

  if (!gte(input.availableBalance, input.amount)) {
    return err({
      code: 'insufficient_funds',
      message: 'This withdrawal is more than your available balance.',
    })
  }

  return ok({
    gross: input.amount,
    fee,
    net,
    requiresDualApproval: requiresDualApproval(input.amount, input.settings),
  })
}

export function requiresDualApproval(amount: Money, settings: FinanceSettings): boolean {
  const threshold = fromMajorUnits(settings.withdrawalDualApprovalThreshold, amount.currency)
  return amount.minorUnits >= threshold.minorUnits
}

export type ApprovalRecord = { approverId: string; decision: 'approve' | 'reject' }

export type ApprovalCheckError = {
  code: 'already_signed' | 'awaiting_second_approval'
  message: string
  /** How many more distinct approvals are still needed. */
  outstanding: number
}

/**
 * Can this approver's signature be recorded, and does it complete the
 * withdrawal? Returns 'complete' only when the required number of
 * *distinct* approvers have signed.
 */
export function evaluateApproval(input: {
  approverId: string
  existingApprovals: readonly ApprovalRecord[]
  requiresDualApproval: boolean
}): Result<'complete' | 'awaiting_second_approval', ApprovalCheckError> {
  const required = input.requiresDualApproval ? 2 : 1

  if (input.existingApprovals.some((approval) => approval.approverId === input.approverId)) {
    return err({
      code: 'already_signed',
      message:
        'You have already signed this withdrawal. A second approval must come from a different member of staff.',
      outstanding: Math.max(0, required - input.existingApprovals.length),
    })
  }

  const distinctApprovers = new Set(
    input.existingApprovals.filter((a) => a.decision === 'approve').map((a) => a.approverId),
  )
  distinctApprovers.add(input.approverId)

  if (distinctApprovers.size >= required) {
    return ok('complete')
  }

  return ok('awaiting_second_approval')
}
