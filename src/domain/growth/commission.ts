/**
 * Introducing-broker commission and rank rules.
 *
 * Kept framework-free so the numbers a partner is shown can be unit
 * tested against the numbers that reach the ledger — a commission engine
 * that disagrees with its own payout postings is the classic way these
 * programmes lose trust.
 */
import { applyBasisPoints, fromMajorUnits, isPositive, type Money } from '@/domain/shared/money'
import { err, ok, type Result } from '@/domain/shared/result'

export type CommissionBasis = 'deposit_bps' | 'per_lot' | 'flat'

export type CommissionRule = {
  id: string
  name: string
  basis: CommissionBasis
  /** Basis points for deposit_bps; a currency amount for per_lot and flat. */
  rate: number
  active: boolean
}

export type Rank = {
  id: string
  key: string
  name: string
  minReferredVolume: number
  benefits: { commission_bps?: number; payout_frequency?: string; dedicated_manager?: boolean }
  sortOrder: number
}

export type CommissionError = {
  code: 'no_active_rule' | 'unsupported_basis' | 'zero_commission'
  message: string
}

/**
 * What does an introducing broker earn from one qualifying deposit?
 *
 * A rank's `commission_bps` benefit overrides the rule's rate when the
 * partner has climbed a tier — that is the whole point of the tiers, and
 * it is applied here rather than being scattered across call sites.
 */
export function calculateDepositCommission(input: {
  depositAmount: Money
  rule: CommissionRule
  rank: Rank | null
}): Result<Money, CommissionError> {
  if (!input.rule.active) {
    return err({
      code: 'no_active_rule',
      message: `Commission rule "${input.rule.name}" is not active.`,
    })
  }

  if (input.rule.basis !== 'deposit_bps') {
    return err({
      code: 'unsupported_basis',
      message: `A deposit commission needs a deposit_bps rule; "${input.rule.name}" is ${input.rule.basis}.`,
    })
  }

  const rankBps = input.rank?.benefits.commission_bps
  const basisPoints = Math.round(rankBps ?? input.rule.rate)
  const commission = applyBasisPoints(input.depositAmount, basisPoints)

  if (!isPositive(commission)) {
    return err({
      code: 'zero_commission',
      message: `A ${basisPoints}bp commission on this deposit rounds to zero — nothing to post.`,
    })
  }

  return ok(commission)
}

/** Client-side rebate on their own deposit, same rounding discipline. */
export function calculateRebate(input: {
  depositAmount: Money
  rebateBasisPoints: number
}): Result<Money, CommissionError> {
  const rebate = applyBasisPoints(input.depositAmount, Math.round(input.rebateBasisPoints))
  if (!isPositive(rebate)) {
    return err({
      code: 'zero_commission',
      message: 'The rebate on this deposit rounds to zero — nothing to post.',
    })
  }
  return ok(rebate)
}

/**
 * The highest rank whose volume threshold the partner has met. Ranks are
 * sorted defensively rather than trusting query order.
 */
export function resolveRank(referredVolume: number, ranks: readonly Rank[]): Rank | null {
  const eligible = ranks
    .filter((rank) => referredVolume >= rank.minReferredVolume)
    .sort((a, b) => b.minReferredVolume - a.minReferredVolume)
  return eligible[0] ?? null
}

/** How far to the next tier — drives the partner dashboard's progress bar. */
export function rankProgress(
  referredVolume: number,
  ranks: readonly Rank[],
): { current: Rank | null; next: Rank | null; percentToNext: number; volumeToNext: number } {
  const current = resolveRank(referredVolume, ranks)
  const next =
    ranks
      .filter((rank) => rank.minReferredVolume > referredVolume)
      .sort((a, b) => a.minReferredVolume - b.minReferredVolume)[0] ?? null

  if (!next) {
    return { current, next: null, percentToNext: 100, volumeToNext: 0 }
  }

  const floor = current?.minReferredVolume ?? 0
  const span = next.minReferredVolume - floor
  const travelled = referredVolume - floor
  return {
    current,
    next,
    percentToNext: span <= 0 ? 100 : Math.min(100, Math.round((travelled / span) * 100)),
    volumeToNext: Math.max(0, next.minReferredVolume - referredVolume),
  }
}

/** Guard against the obvious abuse: crediting yourself for your own signup. */
export function canAttributeReferral(input: {
  referrerId: string
  refereeId: string
  existingReferrerId: string | null
}): Result<'attributable', { code: 'self_referral' | 'already_attributed'; message: string }> {
  if (input.referrerId === input.refereeId) {
    return err({ code: 'self_referral', message: 'A client cannot refer themselves.' })
  }
  if (input.existingReferrerId) {
    return err({
      code: 'already_attributed',
      message: 'This client is already attributed to another introducing broker.',
    })
  }
  return ok('attributable')
}

/** Total commission still owed to a partner, for the payout queue. */
export function outstandingCommission(
  commissions: readonly { amount: number; status: string }[],
  currency: string,
): Money {
  const total = commissions
    .filter((c) => c.status === 'approved')
    .reduce((sum, c) => sum + c.amount, 0)
  return fromMajorUnits(total, currency)
}
