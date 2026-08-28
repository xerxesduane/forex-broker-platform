import { describe, expect, it } from 'vitest'
import { decisionRequiresReason, isTerminalKycStatus, transitionKycStatus } from './state-machine'

describe('transitionKycStatus', () => {
  it('allows a client to submit from not_started', () => {
    const result = transitionKycStatus('not_started', { type: 'SUBMIT' })
    expect(result).toEqual({ ok: true, value: 'submitted' })
  })

  it('allows an analyst to approve directly from submitted', () => {
    const result = transitionKycStatus('submitted', { type: 'APPROVE' })
    expect(result).toEqual({ ok: true, value: 'approved' })
  })

  it('allows an analyst to reject from in_review', () => {
    const result = transitionKycStatus('in_review', {
      type: 'REJECT',
      reason: 'Document illegible',
    })
    expect(result).toEqual({ ok: true, value: 'rejected' })
  })

  it('rejects submitting twice', () => {
    const result = transitionKycStatus('submitted', { type: 'SUBMIT' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('invalid_transition')
      expect(result.error.from).toBe('submitted')
    }
  })

  it('rejects any transition out of a terminal state', () => {
    const approved = transitionKycStatus('approved', { type: 'SUBMIT' })
    const rejected = transitionKycStatus('rejected', { type: 'START_REVIEW' })
    expect(approved.ok).toBe(false)
    expect(rejected.ok).toBe(false)
  })

  it('allows resubmission after a revision request', () => {
    const revision = transitionKycStatus('in_review', {
      type: 'REQUEST_REVISION',
      reason: 'Blurry photo',
    })
    expect(revision).toEqual({ ok: true, value: 'needs_revision' })

    const resubmit = transitionKycStatus('needs_revision', { type: 'RESUBMIT' })
    expect(resubmit).toEqual({ ok: true, value: 'submitted' })
  })
})

describe('decisionRequiresReason', () => {
  it('requires a reason to reject or request revision', () => {
    expect(decisionRequiresReason({ type: 'REJECT', reason: 'x' })).toBe(true)
    expect(decisionRequiresReason({ type: 'REQUEST_REVISION', reason: 'x' })).toBe(true)
  })

  it('does not require a reason to approve', () => {
    expect(decisionRequiresReason({ type: 'APPROVE' })).toBe(false)
  })
})

describe('isTerminalKycStatus', () => {
  it('treats approved and rejected as terminal', () => {
    expect(isTerminalKycStatus('approved')).toBe(true)
    expect(isTerminalKycStatus('rejected')).toBe(true)
    expect(isTerminalKycStatus('submitted')).toBe(false)
  })
})
