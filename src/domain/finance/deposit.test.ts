import { describe, expect, it } from 'vitest'
import { fromMajorUnits } from '@/domain/shared/money'
import { checkDepositEligibility, requiresManualApproval, transitionDeposit } from './deposit'
import type { FinanceSettings } from './types'

const SETTINGS: FinanceSettings = {
  depositMin: 50,
  depositAutoCreditLimit: 2500,
  withdrawalMin: 50,
  withdrawalFee: 5,
  withdrawalDualApprovalThreshold: 5000,
}

const usd = (amount: number) => fromMajorUnits(amount, 'USD')

describe('transitionDeposit', () => {
  it('walks the happy path pending → confirmed → approved', () => {
    const confirmed = transitionDeposit('pending', { type: 'PROVIDER_CONFIRMED' })
    expect(confirmed).toEqual({ ok: true, value: 'confirmed' })
    expect(transitionDeposit('confirmed', { type: 'APPROVE' })).toEqual({
      ok: true,
      value: 'approved',
    })
  })

  it('refuses to approve a deposit the provider has not confirmed', () => {
    const result = transitionDeposit('pending', { type: 'APPROVE' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('invalid_transition')
  })

  it('will not re-decide a deposit that is already approved', () => {
    expect(transitionDeposit('approved', { type: 'REJECT', reason: 'changed mind' }).ok).toBe(false)
    expect(transitionDeposit('approved', { type: 'APPROVE' }).ok).toBe(false)
  })

  it('allows a rejection from either pending or confirmed', () => {
    expect(transitionDeposit('pending', { type: 'REJECT', reason: 'AML flag' }).ok).toBe(true)
    expect(transitionDeposit('confirmed', { type: 'REJECT', reason: 'AML flag' }).ok).toBe(true)
  })

  it('is a dead end once rejected or failed', () => {
    expect(transitionDeposit('rejected', { type: 'APPROVE' }).ok).toBe(false)
    expect(transitionDeposit('failed', { type: 'PROVIDER_CONFIRMED' }).ok).toBe(false)
  })
})

describe('checkDepositEligibility', () => {
  it('accepts a verified, active client above the minimum', () => {
    const result = checkDepositEligibility({
      amount: usd(500),
      settings: SETTINGS,
      accountStatus: 'active',
      kycStatus: 'approved',
    })
    expect(result.ok).toBe(true)
  })

  it('refuses an amount below the configured minimum', () => {
    const result = checkDepositEligibility({
      amount: usd(49.99),
      settings: SETTINGS,
      accountStatus: 'active',
      kycStatus: 'approved',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('below_minimum')
  })

  it('accepts exactly the minimum', () => {
    const result = checkDepositEligibility({
      amount: usd(50),
      settings: SETTINGS,
      accountStatus: 'active',
      kycStatus: 'approved',
    })
    expect(result.ok).toBe(true)
  })

  it('refuses a suspended account even with approved KYC', () => {
    const result = checkDepositEligibility({
      amount: usd(500),
      settings: SETTINGS,
      accountStatus: 'suspended',
      kycStatus: 'approved',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('account_restricted')
  })

  it('refuses an unverified client', () => {
    for (const kycStatus of ['not_started', 'submitted', 'in_review', 'rejected']) {
      const result = checkDepositEligibility({
        amount: usd(500),
        settings: SETTINGS,
        accountStatus: 'active',
        kycStatus,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.error.code).toBe('kyc_required')
    }
  })
})

describe('requiresManualApproval', () => {
  it('auto-credits at or below the configured limit', () => {
    expect(requiresManualApproval(usd(2499.99), SETTINGS)).toBe(false)
    expect(requiresManualApproval(usd(2500), SETTINGS)).toBe(false)
  })

  it('queues anything above the limit', () => {
    expect(requiresManualApproval(usd(2500.01), SETTINGS)).toBe(true)
    expect(requiresManualApproval(usd(10_000), SETTINGS)).toBe(true)
  })

  it('follows the setting rather than a hardcoded number', () => {
    const strict: FinanceSettings = { ...SETTINGS, depositAutoCreditLimit: 100 }
    expect(requiresManualApproval(usd(500), strict)).toBe(true)
  })
})
