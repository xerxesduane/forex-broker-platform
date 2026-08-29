/**
 * Deposit lifecycle and the auto-credit rule.
 *
 * A deposit only reaches the ledger once, at exactly one point: the
 * transition into 'approved'. Everything before that is a request being
 * tracked, which is why nothing here writes a balance — see
 * src/domain/ledger/posting.ts for the posting shape and ADR 0003 for
 * why the two are separate.
 */
import { fromMajorUnits, gte, type Money } from '@/domain/shared/money'
import { err, ok, type Result } from '@/domain/shared/result'
import type { DepositEvent, FinanceSettings, MoneyMovementStatus } from './types'

export type DepositTransitionError = {
  code: 'invalid_transition'
  message: string
  from: MoneyMovementStatus
  event: DepositEvent['type']
}

const TRANSITIONS: Record<
  MoneyMovementStatus,
  Partial<Record<DepositEvent['type'], MoneyMovementStatus>>
> = {
  pending: { PROVIDER_CONFIRMED: 'confirmed', PROVIDER_FAILED: 'failed', REJECT: 'rejected' },
  confirmed: { APPROVE: 'approved', REJECT: 'rejected' },
  approved: {},
  rejected: {},
  paid: {},
  failed: {},
  reversed: {},
}

export function transitionDeposit(
  current: MoneyMovementStatus,
  event: DepositEvent,
): Result<MoneyMovementStatus, DepositTransitionError> {
  const next = TRANSITIONS[current][event.type]
  if (!next) {
    return err({
      code: 'invalid_transition',
      message: `Cannot apply ${event.type} to a deposit in status "${current}".`,
      from: current,
      event: event.type,
    })
  }
  return ok(next)
}

export type DepositRequestError = {
  code: 'below_minimum' | 'account_restricted' | 'kyc_required'
  message: string
}

/**
 * Whether a client may request a deposit at all. Deliberately stricter
 * than the UI: the portal hides the form for a restricted account, and
 * this rule refuses it regardless, because a hidden button is not
 * authorization (ADR 0004).
 */
export function checkDepositEligibility(input: {
  amount: Money
  settings: FinanceSettings
  accountStatus: string
  kycStatus: string
}): Result<Money, DepositRequestError> {
  if (input.accountStatus !== 'active') {
    return err({
      code: 'account_restricted',
      message: `Deposits are unavailable while the account status is "${input.accountStatus}". Contact support.`,
    })
  }

  if (input.kycStatus !== 'approved') {
    return err({
      code: 'kyc_required',
      message: 'Identity verification must be approved before funding an account.',
    })
  }

  const minimum = fromMajorUnits(input.settings.depositMin, input.amount.currency)
  if (!gte(input.amount, minimum)) {
    return err({
      code: 'below_minimum',
      message: `The minimum deposit is ${input.settings.depositMin} ${input.amount.currency}.`,
    })
  }

  return ok(input.amount)
}

/**
 * After the provider confirms, does the deposit post automatically or
 * queue for a finance operator? Driven by the
 * finance.deposit_auto_credit_limit platform setting, so the demo can
 * show the threshold being changed and the behaviour following it.
 */
export function requiresManualApproval(amount: Money, settings: FinanceSettings): boolean {
  const limit = fromMajorUnits(settings.depositAutoCreditLimit, amount.currency)
  return amount.minorUnits > limit.minorUnits
}
