import { describe, expect, it } from 'vitest'
import { isBreachingFirstResponse, transitionTicket } from './state-machine'

describe('transitionTicket', () => {
  it('moves to pending-on-client when staff reply', () => {
    expect(transitionTicket('open', { type: 'STAFF_REPLY' })).toEqual({
      ok: true,
      value: 'pending',
    })
  })

  it('comes back to open when the client replies', () => {
    expect(transitionTicket('pending', { type: 'CLIENT_REPLY' })).toEqual({
      ok: true,
      value: 'open',
    })
  })

  it('reopens a resolved ticket when the client replies again', () => {
    expect(transitionTicket('resolved', { type: 'CLIENT_REPLY' })).toEqual({
      ok: true,
      value: 'open',
    })
  })

  it('allows a closed ticket to be reopened, but nothing else', () => {
    expect(transitionTicket('closed', { type: 'REOPEN' })).toEqual({ ok: true, value: 'open' })
    expect(transitionTicket('closed', { type: 'STAFF_REPLY' }).ok).toBe(false)
    expect(transitionTicket('closed', { type: 'RESOLVE' }).ok).toBe(false)
  })

  it('can resolve from open or pending', () => {
    expect(transitionTicket('open', { type: 'RESOLVE' }).ok).toBe(true)
    expect(transitionTicket('pending', { type: 'RESOLVE' }).ok).toBe(true)
  })

  it('reports the offending state on an invalid transition', () => {
    const result = transitionTicket('closed', { type: 'RESOLVE' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.from).toBe('closed')
      expect(result.error.event).toBe('RESOLVE')
    }
  })
})

describe('isBreachingFirstResponse', () => {
  const createdAt = new Date('2026-03-01T09:00:00Z')

  it('is not breaching once a first response exists', () => {
    expect(
      isBreachingFirstResponse({
        priority: 'high',
        createdAt,
        firstResponseAt: new Date('2026-03-01T09:30:00Z'),
        now: new Date('2026-03-05T09:00:00Z'),
      }),
    ).toBe(false)
  })

  it('breaches a high-priority ticket after 2 hours', () => {
    expect(
      isBreachingFirstResponse({
        priority: 'high',
        createdAt,
        firstResponseAt: null,
        now: new Date('2026-03-01T11:01:00Z'),
      }),
    ).toBe(true)
  })

  it('does not breach a high-priority ticket within 2 hours', () => {
    expect(
      isBreachingFirstResponse({
        priority: 'high',
        createdAt,
        firstResponseAt: null,
        now: new Date('2026-03-01T10:59:00Z'),
      }),
    ).toBe(false)
  })

  it('gives a low-priority ticket a full day', () => {
    expect(
      isBreachingFirstResponse({
        priority: 'low',
        createdAt,
        firstResponseAt: null,
        now: new Date('2026-03-02T08:00:00Z'),
      }),
    ).toBe(false)
    expect(
      isBreachingFirstResponse({
        priority: 'low',
        createdAt,
        firstResponseAt: null,
        now: new Date('2026-03-02T10:00:00Z'),
      }),
    ).toBe(true)
  })
})
