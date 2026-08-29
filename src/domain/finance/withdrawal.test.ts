import { describe, expect, it } from 'vitest'
import { fromMajorUnits, toMajorUnits } from '@/domain/shared/money'
import {
  evaluateApproval,
  quoteWithdrawal,
  requiresDualApproval,
  transitionWithdrawal,
} from './withdrawal'
import type { FinanceSettings } from './types'

const SETTINGS: FinanceSettings = {
  depositMin: 50,
  depositAutoCreditLimit: 2500,
  withdrawalMin: 50,
  withdrawalFee: 5,
  withdrawalDualApprovalThreshold: 5000,
}

const usd = (amount: number) => fromMajorUnits(amount, 'USD')

describe('transitionWithdrawal', () => {
  it('walks pending → approved → paid', () => {
    expect(transitionWithdrawal('pending', { type: 'APPROVE' })).toEqual({
      ok: true,
      value: 'approved',
    })
    expect(transitionWithdrawal('approved', { type: 'MARK_PAID' })).toEqual({
      ok: true,
      value: 'paid',
    })
  })

  it('will not pay a withdrawal that was never approved', () => {
    expect(transitionWithdrawal('pending', { type: 'MARK_PAID' }).ok).toBe(false)
  })

  it('will not re-open a paid withdrawal', () => {
    expect(transitionWithdrawal('paid', { type: 'REJECT', reason: 'oops' }).ok).toBe(false)
    expect(transitionWithdrawal('paid', { type: 'MARK_PAID' }).ok).toBe(false)
  })

  it('allows an approved withdrawal to be rejected before payout', () => {
    expect(transitionWithdrawal('approved', { type: 'REJECT', reason: 'sanctions hit' }).ok).toBe(
      true,
    )
  })
})

describe('quoteWithdrawal', () => {
  it('deducts the fee from the amount the client receives', () => {
    const result = quoteWithdrawal({
      amount: usd(500),
      availableBalance: usd(1000),
      settings: SETTINGS,
      accountStatus: 'active',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(toMajorUnits(result.value.gross)).toBe(500)
    expect(toMajorUnits(result.value.fee)).toBe(5)
    expect(toMajorUnits(result.value.net)).toBe(495)
    expect(result.value.requiresDualApproval).toBe(false)
  })

  it('refuses more than the available balance', () => {
    const result = quoteWithdrawal({
      amount: usd(1000.01),
      availableBalance: usd(1000),
      settings: SETTINGS,
      accountStatus: 'active',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('insufficient_funds')
  })

  it('allows withdrawing the exact available balance', () => {
    const result = quoteWithdrawal({
      amount: usd(1000),
      availableBalance: usd(1000),
      settings: SETTINGS,
      accountStatus: 'active',
    })
    expect(result.ok).toBe(true)
  })

  it('refuses below the minimum', () => {
    const result = quoteWithdrawal({
      amount: usd(49),
      availableBalance: usd(1000),
      settings: SETTINGS,
      accountStatus: 'active',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('below_minimum')
  })

  it('refuses a restricted account', () => {
    const result = quoteWithdrawal({
      amount: usd(100),
      availableBalance: usd(1000),
      settings: SETTINGS,
      accountStatus: 'restricted',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('account_restricted')
  })

  it('refuses an amount that would not cover its own fee', () => {
    const feeHeavy: FinanceSettings = { ...SETTINGS, withdrawalMin: 1, withdrawalFee: 25 }
    const result = quoteWithdrawal({
      amount: usd(25),
      availableBalance: usd(1000),
      settings: feeHeavy,
      accountStatus: 'active',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('fee_exceeds_amount')
  })

  it('flags dual approval at the threshold', () => {
    const result = quoteWithdrawal({
      amount: usd(5000),
      availableBalance: usd(20_000),
      settings: SETTINGS,
      accountStatus: 'active',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.requiresDualApproval).toBe(true)
  })
})

describe('requiresDualApproval', () => {
  it('is inclusive of the threshold', () => {
    expect(requiresDualApproval(usd(4999.99), SETTINGS)).toBe(false)
    expect(requiresDualApproval(usd(5000), SETTINGS)).toBe(true)
  })
})

describe('evaluateApproval (maker-checker)', () => {
  it('completes on one signature below the threshold', () => {
    const result = evaluateApproval({
      approverId: 'staff-a',
      existingApprovals: [],
      requiresDualApproval: false,
    })
    expect(result).toEqual({ ok: true, value: 'complete' })
  })

  it('waits for a second signature above the threshold', () => {
    const result = evaluateApproval({
      approverId: 'staff-a',
      existingApprovals: [],
      requiresDualApproval: true,
    })
    expect(result).toEqual({ ok: true, value: 'awaiting_second_approval' })
  })

  it('completes when a different approver signs second', () => {
    const result = evaluateApproval({
      approverId: 'staff-b',
      existingApprovals: [{ approverId: 'staff-a', decision: 'approve' }],
      requiresDualApproval: true,
    })
    expect(result).toEqual({ ok: true, value: 'complete' })
  })

  it('refuses the same approver signing twice — the control an auditor asks about', () => {
    const result = evaluateApproval({
      approverId: 'staff-a',
      existingApprovals: [{ approverId: 'staff-a', decision: 'approve' }],
      requiresDualApproval: true,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('already_signed')
      expect(result.error.message).toContain('different member of staff')
    }
  })

  it('does not count a rejection as one of the required approvals', () => {
    const result = evaluateApproval({
      approverId: 'staff-b',
      existingApprovals: [{ approverId: 'staff-a', decision: 'reject' }],
      requiresDualApproval: true,
    })
    expect(result).toEqual({ ok: true, value: 'awaiting_second_approval' })
  })
})
