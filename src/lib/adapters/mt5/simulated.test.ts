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

  it('returns a snapshot with no exposure for a freshly provisioned demo account', async () => {
    const { adapter } = makeAdapter()
    const result = await adapter.getAccountSnapshot(999999)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.value.balance).toBe(result.value.equity)
      expect(result.value.usedMargin).toBe(0)
    }
  })
})
