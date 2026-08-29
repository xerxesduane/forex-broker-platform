/**
 * Support ticket lifecycle. Modelled as a state machine rather than a
 * free-text status column so "resolved then reopened" is a legal,
 * recorded path and "closed then edited" is not.
 */
import { err, ok, type Result } from '@/domain/shared/result'

export type TicketStatus = 'open' | 'pending' | 'resolved' | 'closed'

export type TicketEvent =
  | { type: 'STAFF_REPLY' }
  | { type: 'CLIENT_REPLY' }
  | { type: 'RESOLVE' }
  | { type: 'REOPEN' }
  | { type: 'CLOSE' }

export type TicketTransitionError = {
  code: 'invalid_transition'
  message: string
  from: TicketStatus
  event: TicketEvent['type']
}

const TRANSITIONS: Record<TicketStatus, Partial<Record<TicketEvent['type'], TicketStatus>>> = {
  // 'pending' means pending on the client: staff have replied and are waiting.
  open: { STAFF_REPLY: 'pending', CLIENT_REPLY: 'open', RESOLVE: 'resolved', CLOSE: 'closed' },
  pending: { STAFF_REPLY: 'pending', CLIENT_REPLY: 'open', RESOLVE: 'resolved', CLOSE: 'closed' },
  resolved: { CLIENT_REPLY: 'open', REOPEN: 'open', CLOSE: 'closed' },
  closed: { REOPEN: 'open' },
}

export function transitionTicket(
  current: TicketStatus,
  event: TicketEvent,
): Result<TicketStatus, TicketTransitionError> {
  const next = TRANSITIONS[current][event.type]
  if (!next) {
    return err({
      code: 'invalid_transition',
      message: `Cannot apply ${event.type} to a ticket in status "${current}".`,
      from: current,
      event: event.type,
    })
  }
  return ok(next)
}

export const TICKET_CATEGORIES = [
  { key: 'general', label: 'General question' },
  { key: 'account', label: 'Account & profile' },
  { key: 'verification', label: 'Verification / KYC' },
  { key: 'funding', label: 'Deposits & withdrawals' },
  { key: 'platform', label: 'MT5 platform access' },
  { key: 'partners', label: 'Partner programme' },
] as const

/**
 * Target first-response times by priority, in hours. Used to flag an
 * ageing queue in the admin inbox — a support SLA a broker's ops lead
 * will look for.
 */
export const FIRST_RESPONSE_TARGET_HOURS: Record<'low' | 'medium' | 'high', number> = {
  high: 2,
  medium: 8,
  low: 24,
}

export function isBreachingFirstResponse(input: {
  priority: 'low' | 'medium' | 'high'
  createdAt: Date
  firstResponseAt: Date | null
  now: Date
}): boolean {
  if (input.firstResponseAt) return false
  const targetMs = FIRST_RESPONSE_TARGET_HOURS[input.priority] * 60 * 60 * 1000
  return input.now.getTime() - input.createdAt.getTime() > targetMs
}
