import { describe, expect, it } from 'vitest'
import { transitionTradingAccountStatus } from './state-machine'

describe('transitionTradingAccountStatus', () => {
  it('walks a demo account from requested to active', () => {
    const provisioning = transitionTradingAccountStatus('requested', {
      type: 'START_PROVISIONING',
    })
    expect(provisioning).toEqual({ ok: true, value: 'provisioning' })

    const active = transitionTradingAccountStatus('provisioning', {
      type: 'PROVISION_SUCCEEDED',
    })
    expect(active).toEqual({ ok: true, value: 'active' })
  })

  it('moves to rejected when provisioning fails', () => {
    const result = transitionTradingAccountStatus('provisioning', {
      type: 'PROVISION_FAILED',
      reason: 'Simulated adapter timeout',
    })
    expect(result).toEqual({ ok: true, value: 'rejected' })
  })

  it('refuses to re-provision an already-active account', () => {
    const result = transitionTradingAccountStatus('active', { type: 'START_PROVISIONING' })
    expect(result.ok).toBe(false)
  })

  it('refuses to act on a closed account', () => {
    const result = transitionTradingAccountStatus('closed', { type: 'REACTIVATE' })
    expect(result.ok).toBe(false)
  })

  it('allows suspend then reactivate', () => {
    const suspended = transitionTradingAccountStatus('active', {
      type: 'SUSPEND',
      reason: 'Manual review',
    })
    expect(suspended).toEqual({ ok: true, value: 'suspended' })

    const reactivated = transitionTradingAccountStatus('suspended', { type: 'REACTIVATE' })
    expect(reactivated).toEqual({ ok: true, value: 'active' })
  })
})
