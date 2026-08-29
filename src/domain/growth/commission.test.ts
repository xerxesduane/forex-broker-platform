import { describe, expect, it } from 'vitest'
import { fromMajorUnits, toMajorUnits } from '@/domain/shared/money'
import {
  calculateDepositCommission,
  calculateRebate,
  canAttributeReferral,
  outstandingCommission,
  rankProgress,
  resolveRank,
  type CommissionRule,
  type Rank,
} from './commission'

const usd = (amount: number) => fromMajorUnits(amount, 'USD')

const STANDARD_RULE: CommissionRule = {
  id: 'rule-1',
  name: 'Standard referral',
  basis: 'deposit_bps',
  rate: 150,
  active: true,
}

const BRONZE: Rank = {
  id: 'r1',
  key: 'bronze',
  name: 'Bronze',
  minReferredVolume: 0,
  benefits: { commission_bps: 150 },
  sortOrder: 1,
}
const SILVER: Rank = {
  id: 'r2',
  key: 'silver',
  name: 'Silver',
  minReferredVolume: 50_000,
  benefits: { commission_bps: 200 },
  sortOrder: 2,
}
const GOLD: Rank = {
  id: 'r3',
  key: 'gold',
  name: 'Gold',
  minReferredVolume: 250_000,
  benefits: { commission_bps: 275 },
  sortOrder: 3,
}
const PLATINUM: Rank = {
  id: 'r4',
  key: 'platinum',
  name: 'Platinum',
  minReferredVolume: 1_000_000,
  benefits: { commission_bps: 350 },
  sortOrder: 4,
}

const RANKS: Rank[] = [BRONZE, SILVER, GOLD, PLATINUM]

describe('calculateDepositCommission', () => {
  it('applies the rule rate when the partner has no rank', () => {
    const result = calculateDepositCommission({
      depositAmount: usd(10_000),
      rule: STANDARD_RULE,
      rank: null,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(toMajorUnits(result.value)).toBe(150)
  })

  it("lets a rank's benefit override the rule rate", () => {
    const result = calculateDepositCommission({
      depositAmount: usd(10_000),
      rule: STANDARD_RULE,
      rank: GOLD, // 275bp
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(toMajorUnits(result.value)).toBe(275)
  })

  it('rounds to the cent rather than carrying a fraction', () => {
    const result = calculateDepositCommission({
      depositAmount: usd(333.33),
      rule: STANDARD_RULE,
      rank: null,
    })
    expect(result.ok).toBe(true)
    // 1.5% of 333.33 = 4.99995
    if (result.ok) expect(toMajorUnits(result.value)).toBe(5)
  })

  it('refuses an inactive rule', () => {
    const result = calculateDepositCommission({
      depositAmount: usd(10_000),
      rule: { ...STANDARD_RULE, active: false },
      rank: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('no_active_rule')
  })

  it('refuses a rule with the wrong basis', () => {
    const result = calculateDepositCommission({
      depositAmount: usd(10_000),
      rule: { ...STANDARD_RULE, basis: 'per_lot' },
      rank: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('unsupported_basis')
  })

  it('refuses to post a commission that rounds to zero', () => {
    const result = calculateDepositCommission({
      depositAmount: usd(0.01),
      rule: STANDARD_RULE,
      rank: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('zero_commission')
  })
})

describe('calculateRebate', () => {
  it('applies the configured basis points', () => {
    const result = calculateRebate({ depositAmount: usd(4000), rebateBasisPoints: 25 })
    expect(result.ok).toBe(true)
    if (result.ok) expect(toMajorUnits(result.value)).toBe(10)
  })
})

describe('resolveRank', () => {
  it('picks the highest rank the volume qualifies for', () => {
    expect(resolveRank(0, RANKS)?.key).toBe('bronze')
    expect(resolveRank(49_999, RANKS)?.key).toBe('bronze')
    expect(resolveRank(50_000, RANKS)?.key).toBe('silver')
    expect(resolveRank(999_999, RANKS)?.key).toBe('gold')
    expect(resolveRank(5_000_000, RANKS)?.key).toBe('platinum')
  })

  it('is order-independent', () => {
    const shuffled = [PLATINUM, BRONZE, GOLD, SILVER]
    expect(resolveRank(300_000, shuffled)?.key).toBe('gold')
  })

  it('returns null when nothing qualifies', () => {
    expect(resolveRank(10, [PLATINUM])).toBeNull()
  })
})

describe('rankProgress', () => {
  it('reports progress towards the next tier', () => {
    const progress = rankProgress(25_000, RANKS)
    expect(progress.current?.key).toBe('bronze')
    expect(progress.next?.key).toBe('silver')
    expect(progress.percentToNext).toBe(50)
    expect(progress.volumeToNext).toBe(25_000)
  })

  it('caps out at the top tier', () => {
    const progress = rankProgress(2_000_000, RANKS)
    expect(progress.current?.key).toBe('platinum')
    expect(progress.next).toBeNull()
    expect(progress.percentToNext).toBe(100)
    expect(progress.volumeToNext).toBe(0)
  })
})

describe('canAttributeReferral', () => {
  it('allows a genuine referral', () => {
    const result = canAttributeReferral({
      referrerId: 'a',
      refereeId: 'b',
      existingReferrerId: null,
    })
    expect(result.ok).toBe(true)
  })

  it('blocks self-referral', () => {
    const result = canAttributeReferral({
      referrerId: 'a',
      refereeId: 'a',
      existingReferrerId: null,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('self_referral')
  })

  it('blocks re-attributing a client who already has a partner', () => {
    const result = canAttributeReferral({
      referrerId: 'a',
      refereeId: 'b',
      existingReferrerId: 'c',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('already_attributed')
  })
})

describe('outstandingCommission', () => {
  it('counts only approved commissions', () => {
    const total = outstandingCommission(
      [
        { amount: 100, status: 'approved' },
        { amount: 50, status: 'pending' },
        { amount: 25, status: 'paid' },
        { amount: 10, status: 'void' },
        { amount: 40.5, status: 'approved' },
      ],
      'USD',
    )
    expect(toMajorUnits(total)).toBe(140.5)
  })

  it('is zero for an empty list', () => {
    expect(toMajorUnits(outstandingCommission([], 'USD'))).toBe(0)
  })
})
