import { err, ok, type Result } from '@/domain/shared/result'
import type { TradingAccountEvent, TradingAccountStatus } from './types'

export type TradingAccountTransitionError = {
  code: 'invalid_transition'
  message: string
  from: TradingAccountStatus
  event: TradingAccountEvent['type']
}

const TRANSITIONS: Record<
  TradingAccountStatus,
  Partial<Record<TradingAccountEvent['type'], TradingAccountStatus>>
> = {
  requested: { START_PROVISIONING: 'provisioning', REJECT_REQUEST: 'rejected' },
  provisioning: { PROVISION_SUCCEEDED: 'active', PROVISION_FAILED: 'rejected' },
  active: { SUSPEND: 'suspended', CLOSE: 'closed' },
  suspended: { REACTIVATE: 'active', CLOSE: 'closed' },
  rejected: {},
  closed: {},
}

export function transitionTradingAccountStatus(
  current: TradingAccountStatus,
  event: TradingAccountEvent,
): Result<TradingAccountStatus, TradingAccountTransitionError> {
  const next = TRANSITIONS[current][event.type]
  if (!next) {
    return err({
      code: 'invalid_transition',
      message: `Cannot apply ${event.type} to a trading account in status "${current}".`,
      from: current,
      event: event.type,
    })
  }
  return ok(next)
}
