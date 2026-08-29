import { describe, expect, it } from 'vitest'
import {
  add,
  applyBasisPoints,
  formatMoney,
  fromMajorUnits,
  fromMinorUnits,
  MoneyError,
  subtract,
  sum,
  toMajorUnits,
  zero,
} from './money'

describe('money', () => {
  it('holds amounts as integer cents', () => {
    expect(fromMajorUnits(250.75, 'USD')).toEqual({ minorUnits: 25075, currency: 'USD' })
  })

  it('adds without float drift (the reason this module exists)', () => {
    // 0.1 + 0.2 === 0.30000000000000004 in IEEE-754.
    const total = add(fromMajorUnits(0.1, 'USD'), fromMajorUnits(0.2, 'USD'))
    expect(toMajorUnits(total)).toBe(0.3)
  })

  it('sums a long list exactly', () => {
    const amounts = Array.from({ length: 100 }, () => fromMajorUnits(0.07, 'USD'))
    expect(toMajorUnits(sum(amounts, 'USD'))).toBe(7)
  })

  it('rounds a value that floats just below the cent', () => {
    // 2.675 * 100 is 267.49999999999997 — truncation would lose a cent.
    expect(fromMajorUnits(2.675, 'USD').minorUnits).toBe(268)
  })

  it('refuses to mix currencies without an explicit rate', () => {
    expect(() => add(fromMajorUnits(10, 'USD'), fromMajorUnits(10, 'EUR'))).toThrow(MoneyError)
  })

  it('refuses non-integer minor units', () => {
    expect(() => fromMinorUnits(10.5, 'USD')).toThrow(MoneyError)
  })

  it('refuses a non-finite amount', () => {
    expect(() => fromMajorUnits(Number.NaN, 'USD')).toThrow(MoneyError)
    expect(() => fromMajorUnits(Number.POSITIVE_INFINITY, 'USD')).toThrow(MoneyError)
  })

  it('subtracts into a negative balance rather than clamping', () => {
    const result = subtract(fromMajorUnits(10, 'USD'), fromMajorUnits(25, 'USD'))
    expect(toMajorUnits(result)).toBe(-15)
  })

  describe('applyBasisPoints', () => {
    it('applies 150bp as 1.5%', () => {
      expect(toMajorUnits(applyBasisPoints(fromMajorUnits(1000, 'USD'), 150))).toBe(15)
    })

    it('rounds to the nearest cent', () => {
      // 1.5% of 33.33 is 0.49995 → 0.50
      expect(toMajorUnits(applyBasisPoints(fromMajorUnits(33.33, 'USD'), 150))).toBe(0.5)
    })

    it('can round down to zero on a tiny base', () => {
      expect(applyBasisPoints(fromMajorUnits(0.01, 'USD'), 25).minorUnits).toBe(0)
    })

    it('rejects a negative or fractional rate', () => {
      expect(() => applyBasisPoints(fromMajorUnits(100, 'USD'), -1)).toThrow(MoneyError)
      expect(() => applyBasisPoints(fromMajorUnits(100, 'USD'), 1.5)).toThrow(MoneyError)
    })
  })

  it('formats for display', () => {
    expect(formatMoney(fromMajorUnits(1234.5, 'USD'), 'en-US')).toBe('$1,234.50')
  })

  it('starts at zero', () => {
    expect(toMajorUnits(zero('USD'))).toBe(0)
  })
})
