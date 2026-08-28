import { err, ok, type Result } from '@/domain/shared/result'
import type { KycEvent, KycStatus } from './types'

export type KycTransitionError = {
  code: 'invalid_transition'
  message: string
  from: KycStatus
  event: KycEvent['type']
}

/**
 * The full set of legal (from, event) -> to transitions. This is the only
 * place KYC status changes are decided — server actions and the sync
 * trigger (supabase/migrations/...compliance_kyc.sql) must agree with it.
 */
const TRANSITIONS: Record<KycStatus, Partial<Record<KycEvent['type'], KycStatus>>> = {
  not_started: { SUBMIT: 'submitted' },
  submitted: { START_REVIEW: 'in_review', APPROVE: 'approved', REJECT: 'rejected' },
  in_review: {
    REQUEST_REVISION: 'needs_revision',
    APPROVE: 'approved',
    REJECT: 'rejected',
  },
  needs_revision: { RESUBMIT: 'submitted' },
  approved: {},
  rejected: {},
}

export function transitionKycStatus(
  current: KycStatus,
  event: KycEvent,
): Result<KycStatus, KycTransitionError> {
  const next = TRANSITIONS[current][event.type]
  if (!next) {
    return err({
      code: 'invalid_transition',
      message: `Cannot apply ${event.type} to a KYC case in status "${current}".`,
      from: current,
      event: event.type,
    })
  }
  return ok(next)
}

/** A reason is mandatory for any decision that isn't a plain approval. */
export function decisionRequiresReason(event: KycEvent): boolean {
  return event.type === 'REJECT' || event.type === 'REQUEST_REVISION'
}

export function isTerminalKycStatus(status: KycStatus): boolean {
  return status === 'approved' || status === 'rejected'
}
