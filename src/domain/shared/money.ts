/**
 * Money arithmetic in integer minor units (cents). Framework-free (ADR
 * 0002) and float-free: `0.1 + 0.2` money is a bug that reaches a
 * client's balance, so every calculation in the finance domain converts
 * to cents first, works in integers, and converts back exactly once.
 *
 * The database stores numeric(18,2), which is exact — this module exists
 * so the *TypeScript* side of the boundary is exact too.
 */

/** Largest amount any single demo transaction may carry, in cents. */
const MAX_MINOR_UNITS = 1_000_000_000_00 // 1 billion, well beyond demo scale

export type Money = {
  /** Integer cents. Always an integer; never a float. */
  readonly minorUnits: number
  readonly currency: string
}

export class MoneyError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'MoneyError'
  }
}

/** Build a Money from a major-unit amount (e.g. 250.75 dollars). */
export function fromMajorUnits(amount: number, currency: string): Money {
  if (!Number.isFinite(amount)) {
    throw new MoneyError(`Amount must be a finite number, got ${amount}`)
  }
  // Round rather than truncate so 2.675 * 100 = 267.49999... lands on 268.
  const minorUnits = Math.round(amount * 100)
  if (Math.abs(minorUnits) > MAX_MINOR_UNITS) {
    throw new MoneyError(`Amount ${amount} exceeds the supported range`)
  }
  return { minorUnits, currency }
}

export function fromMinorUnits(minorUnits: number, currency: string): Money {
  if (!Number.isInteger(minorUnits)) {
    throw new MoneyError(`Minor units must be an integer, got ${minorUnits}`)
  }
  return { minorUnits, currency }
}

export function zero(currency: string): Money {
  return { minorUnits: 0, currency }
}

/** Major units, suitable for writing to a numeric(18,2) column. */
export function toMajorUnits(money: Money): number {
  return money.minorUnits / 100
}

function assertSameCurrency(a: Money, b: Money): void {
  if (a.currency !== b.currency) {
    throw new MoneyError(
      `Cannot combine ${a.currency} with ${b.currency} — cross-currency arithmetic needs an explicit FX rate`,
    )
  }
}

export function add(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return { minorUnits: a.minorUnits + b.minorUnits, currency: a.currency }
}

export function subtract(a: Money, b: Money): Money {
  assertSameCurrency(a, b)
  return { minorUnits: a.minorUnits - b.minorUnits, currency: a.currency }
}

export function sum(amounts: readonly Money[], currency: string): Money {
  return amounts.reduce((acc, amount) => add(acc, amount), zero(currency))
}

export function isNegative(money: Money): boolean {
  return money.minorUnits < 0
}

export function isZero(money: Money): boolean {
  return money.minorUnits === 0
}

export function isPositive(money: Money): boolean {
  return money.minorUnits > 0
}

export function compare(a: Money, b: Money): number {
  assertSameCurrency(a, b)
  return a.minorUnits - b.minorUnits
}

export function gte(a: Money, b: Money): boolean {
  return compare(a, b) >= 0
}

export function lt(a: Money, b: Money): boolean {
  return compare(a, b) < 0
}

/**
 * Apply a basis-point rate (1 bp = 0.01%), rounding half-up to the cent.
 * Used for referral commissions and client rebates, where "1.5% of a
 * deposit" must land on an exact cent that the ledger can balance.
 */
export function applyBasisPoints(money: Money, basisPoints: number): Money {
  if (!Number.isInteger(basisPoints) || basisPoints < 0) {
    throw new MoneyError(`Basis points must be a non-negative integer, got ${basisPoints}`)
  }
  return {
    minorUnits: Math.round((money.minorUnits * basisPoints) / 10_000),
    currency: money.currency,
  }
}

/** Locale-aware display string. Presentation only — never parsed back. */
export function formatMoney(money: Money, locale?: string): string {
  return (money.minorUnits / 100).toLocaleString(locale ?? 'en-US', {
    style: 'currency',
    currency: money.currency,
  })
}

/** Convenience for rendering a numeric(18,2) value straight from the DB. */
export function formatAmount(amount: number, currency: string, locale?: string): string {
  return amount.toLocaleString(locale ?? 'en-US', { style: 'currency', currency })
}
