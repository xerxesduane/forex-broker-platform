import { describe, expect, it } from 'vitest'
import { demoAccountRequestSchema } from './schema'

describe('demoAccountRequestSchema', () => {
  it('accepts a valid demo request', () => {
    const result = demoAccountRequestSchema.safeParse({
      baseCurrency: 'USD',
      leverage: 100,
      declarationAccepted: true,
    })
    expect(result.success).toBe(true)
  })

  it('rejects an unlisted leverage value', () => {
    const result = demoAccountRequestSchema.safeParse({
      baseCurrency: 'USD',
      leverage: 1000,
      declarationAccepted: true,
    })
    expect(result.success).toBe(false)
  })

  it('rejects when the declaration is not accepted', () => {
    const result = demoAccountRequestSchema.safeParse({
      baseCurrency: 'USD',
      leverage: 100,
      declarationAccepted: false,
    })
    expect(result.success).toBe(false)
  })
})
