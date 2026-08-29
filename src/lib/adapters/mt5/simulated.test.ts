import { describe, expect, it, vi } from 'vitest'
import type { IntegrationEventInput } from '../shared/types'
import { SimulatedMt5Adapter } from './simulated'

function makeAdapter() {
  const events: IntegrationEventInput[] = []
  const recordEvent = vi.fn(async (event: IntegrationEventInput) => {
    events.push(event)
  })
  return { adapter: new SimulatedMt5Adapter(recordEvent), events }
}

describe('SimulatedMt5Adapter', () => {
  it('provisions a demo account with a clearly-fake login prefix', async () => {
    const { adapter, events } = makeAdapter()
    const result = await adapter.provisionDemoAccount({
      idempotencyKey: 'idem-1',
      clientId: 'client-1',
      baseCurrency: 'USD',
      leverage: 100,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(String(result.value.mt5Login).startsWith('9')).toBe(true)
      expect(result.value.mt5Server).toBeTruthy()
      expect(result.value.startingBalance).toBe(10_000)
      expect(result.value.mt5Group).toContain('demo')
    }

    expect(events).toHaveLength(1)
    expect(events[0]).toMatchObject({
      adapter: 'mt5',
      eventType: 'provision_demo_account',
      idempotencyKey: 'idem-1',
      status: 'succeeded',
      simulation: true,
    })
  })

  it('provisions a real account into the plan group, unfunded and distinctly prefixed', async () => {
    const { adapter, events } = makeAdapter()
    const result = await adapter.provisionRealAccount({
      idempotencyKey: 'idem-2',
      clientId: 'client-1',
      baseCurrency: 'USD',
      leverage: 200,
      plan: 'raw',
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      // A different prefix from demo, and still visibly simulated.
      expect(String(result.value.mt5Login).startsWith('8')).toBe(true)
      expect(result.value.mt5Group).toBe('real\\raw')
      // A real account opens empty — money arrives through the ledger,
      // never as a provisioning side effect (ADR 0003).
      expect(result.value.startingBalance).toBe(0)
    }

    expect(events[0]).toMatchObject({
      adapter: 'mt5',
      eventType: 'provision_real_account',
      status: 'succeeded',
    })
  })

  it('reports zero exposure on an unfunded account', async () => {
    const { adapter } = makeAdapter()
    const result = await adapter.getAccountSnapshot(999_999, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.balance).toBe(0)
      expect(result.value.equity).toBe(0)
      expect(result.value.usedMargin).toBe(0)
      expect(result.value.marginLevel).toBeNull()
    }
  })

  it('derives a plausible snapshot from the funded balance', async () => {
    const { adapter } = makeAdapter()
    const result = await adapter.getAccountSnapshot(999_999, 10_000)
    expect(result.ok).toBe(true)
    if (!result.ok) return

    const snapshot = result.value
    expect(snapshot.balance).toBe(10_000)
    // Floating P&L stays within ±2.5% of balance, and margin within 18%.
    expect(snapshot.equity).toBeGreaterThanOrEqual(9_750)
    expect(snapshot.equity).toBeLessThanOrEqual(10_250)
    expect(snapshot.usedMargin).toBeGreaterThanOrEqual(0)
    expect(snapshot.usedMargin).toBeLessThanOrEqual(1_800)
    // Free margin is never negative, and equity/margin stay consistent.
    expect(snapshot.freeMargin).toBeGreaterThanOrEqual(0)
    expect(snapshot.freeMargin).toBeCloseTo(Math.max(0, snapshot.equity - snapshot.usedMargin), 2)
    // Every figure is money-shaped: at most two decimal places.
    for (const value of [snapshot.equity, snapshot.usedMargin, snapshot.freeMargin]) {
      expect(Math.round(value * 100)).toBeCloseTo(value * 100, 6)
    }
  })

  it('records a state change against the login as an integration event', async () => {
    const { adapter, events } = makeAdapter()
    const result = await adapter.setAccountState({
      idempotencyKey: 'idem-3',
      mt5Login: 9_123_456,
      state: 'trade_disabled',
      reason: 'Compliance hold',
    })

    expect(result.ok).toBe(true)
    expect(events[0]).toMatchObject({
      adapter: 'mt5',
      eventType: 'set_account_state',
      status: 'succeeded',
      simulation: true,
      requestSummary: { mt5Login: 9_123_456, state: 'trade_disabled', reason: 'Compliance hold' },
    })
  })
})
