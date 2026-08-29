import { describe, expect, it } from 'vitest'
import { fromMajorUnits } from '@/domain/shared/money'
import {
  buildCommissionPayoutPosting,
  buildDepositPosting,
  buildInternalTransferPosting,
  buildManualAdjustmentPosting,
  buildWithdrawalPayoutPosting,
  buildWithdrawalReservationPosting,
  validatePosting,
  type SystemLedgerAccounts,
} from './posting'

const SYSTEM: SystemLedgerAccounts = {
  houseBank: 'house-bank-id',
  clearingDeposits: 'clearing-deposits-id',
  clearingWithdrawals: 'clearing-withdrawals-id',
  feeIncome: 'fee-income-id',
  brokerExpense: 'broker-expense-id',
}

const CLIENT = 'client-wallet-id'
const usd = (amount: number) => fromMajorUnits(amount, 'USD')

/** Sums a posting's legs the way an auditor would: separately, then compares. */
function totals(legs: { direction: string; amount: number }[]) {
  const debits = legs.filter((l) => l.direction === 'debit').reduce((s, l) => s + l.amount, 0)
  const credits = legs.filter((l) => l.direction === 'credit').reduce((s, l) => s + l.amount, 0)
  return { debits, credits }
}

describe('validatePosting', () => {
  it('rejects a single-leg posting', () => {
    const result = validatePosting({
      currency: 'USD',
      memo: 'one-sided',
      legs: [{ ledgerAccountId: CLIENT, direction: 'credit', amount: 100 }],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('empty')
  })

  it('rejects an unbalanced posting', () => {
    const result = validatePosting({
      currency: 'USD',
      memo: 'off by a cent',
      legs: [
        { ledgerAccountId: SYSTEM.clearingDeposits, direction: 'debit', amount: 100 },
        { ledgerAccountId: CLIENT, direction: 'credit', amount: 99.99 },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.code).toBe('unbalanced')
      expect(result.error.message).toContain('0.01')
    }
  })

  it('rejects a zero or negative leg', () => {
    const result = validatePosting({
      currency: 'USD',
      memo: 'zero leg',
      legs: [
        { ledgerAccountId: SYSTEM.clearingDeposits, direction: 'debit', amount: 0 },
        { ledgerAccountId: CLIENT, direction: 'credit', amount: 0 },
      ],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('non_positive_leg')
  })

  it('accepts a balanced multi-leg posting', () => {
    const result = validatePosting({
      currency: 'USD',
      memo: 'three legs',
      legs: [
        { ledgerAccountId: CLIENT, direction: 'debit', amount: 100 },
        { ledgerAccountId: SYSTEM.clearingWithdrawals, direction: 'credit', amount: 95 },
        { ledgerAccountId: SYSTEM.feeIncome, direction: 'credit', amount: 5 },
      ],
    })
    expect(result.ok).toBe(true)
  })
})

describe('buildDepositPosting', () => {
  it('debits clearing and credits the client wallet', () => {
    const result = buildDepositPosting({
      clientLedgerAccountId: CLIENT,
      system: SYSTEM,
      amount: usd(1500),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(totals(result.value.legs)).toEqual({ debits: 1500, credits: 1500 })
    expect(result.value.legs).toEqual([
      { ledgerAccountId: SYSTEM.clearingDeposits, direction: 'debit', amount: 1500 },
      { ledgerAccountId: CLIENT, direction: 'credit', amount: 1500 },
    ])
  })
})

describe('buildWithdrawalReservationPosting', () => {
  it('debits the gross, credits net to clearing and the fee to income', () => {
    const result = buildWithdrawalReservationPosting({
      clientLedgerAccountId: CLIENT,
      system: SYSTEM,
      grossAmount: usd(500),
      fee: usd(5),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(totals(result.value.legs)).toEqual({ debits: 500, credits: 500 })
    expect(result.value.legs).toContainEqual({
      ledgerAccountId: SYSTEM.feeIncome,
      direction: 'credit',
      amount: 5,
    })
    expect(result.value.legs).toContainEqual({
      ledgerAccountId: SYSTEM.clearingWithdrawals,
      direction: 'credit',
      amount: 495,
    })
  })

  it('omits the fee leg when there is no fee', () => {
    const result = buildWithdrawalReservationPosting({
      clientLedgerAccountId: CLIENT,
      system: SYSTEM,
      grossAmount: usd(500),
      fee: usd(0),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.legs).toHaveLength(2)
  })

  it('refuses a withdrawal that does not cover its own fee', () => {
    const result = buildWithdrawalReservationPosting({
      clientLedgerAccountId: CLIENT,
      system: SYSTEM,
      grossAmount: usd(5),
      fee: usd(5),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('non_positive_leg')
  })
})

describe('buildWithdrawalPayoutPosting', () => {
  it('discharges the payable and takes the cash out of the house bank', () => {
    const result = buildWithdrawalPayoutPosting({ system: SYSTEM, netAmount: usd(495) })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(totals(result.value.legs)).toEqual({ debits: 495, credits: 495 })

    // Direction matters as much as balance here: paying a client must
    // reduce the broker's cash, not increase it.
    expect(result.value.legs).toContainEqual({
      ledgerAccountId: SYSTEM.clearingWithdrawals,
      direction: 'debit',
      amount: 495,
    })
    expect(result.value.legs).toContainEqual({
      ledgerAccountId: SYSTEM.houseBank,
      direction: 'credit',
      amount: 495,
    })
  })

  it('nets the payable back to zero across request and payout', () => {
    // Request reserves 500 gross: 495 to the payable, 5 to fee income.
    const reservation = buildWithdrawalReservationPosting({
      clientLedgerAccountId: CLIENT,
      system: SYSTEM,
      grossAmount: usd(500),
      fee: usd(5),
    })
    const payout = buildWithdrawalPayoutPosting({ system: SYSTEM, netAmount: usd(495) })
    if (!reservation.ok || !payout.ok) throw new Error('expected both postings to build')

    const payableMovement = [...reservation.value.legs, ...payout.value.legs]
      .filter((leg) => leg.ledgerAccountId === SYSTEM.clearingWithdrawals)
      .reduce((net, leg) => net + (leg.direction === 'credit' ? leg.amount : -leg.amount), 0)

    expect(payableMovement).toBe(0)
  })
})

describe('buildInternalTransferPosting', () => {
  it('moves value between two client wallets', () => {
    const result = buildInternalTransferPosting({
      fromLedgerAccountId: CLIENT,
      toLedgerAccountId: 'other-client-wallet',
      amount: usd(200),
      availableBalance: usd(500),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(totals(result.value.legs)).toEqual({ debits: 200, credits: 200 })
  })

  it('refuses an overdraft', () => {
    const result = buildInternalTransferPosting({
      fromLedgerAccountId: CLIENT,
      toLedgerAccountId: 'other-client-wallet',
      amount: usd(600),
      availableBalance: usd(500),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('insufficient_funds')
  })

  it('refuses a transfer to the same wallet', () => {
    const result = buildInternalTransferPosting({
      fromLedgerAccountId: CLIENT,
      toLedgerAccountId: CLIENT,
      amount: usd(10),
      availableBalance: usd(500),
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('same_account')
  })
})

describe('buildCommissionPayoutPosting', () => {
  it('books the cost as an expense, not as cash arriving', () => {
    const result = buildCommissionPayoutPosting({
      ibLedgerAccountId: 'ib-wallet',
      system: SYSTEM,
      amount: usd(22.5),
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return

    expect(totals(result.value.legs)).toEqual({ debits: 22.5, credits: 22.5 })
    expect(result.value.legs).toContainEqual({
      ledgerAccountId: SYSTEM.brokerExpense,
      direction: 'debit',
      amount: 22.5,
    })
    // Crediting a partner must never touch the bank — no cash has moved.
    expect(result.value.legs.some((leg) => leg.ledgerAccountId === SYSTEM.houseBank)).toBe(false)
  })
})

describe('buildManualAdjustmentPosting', () => {
  it('never books an adjustment against the bank', () => {
    const result = buildManualAdjustmentPosting({
      clientLedgerAccountId: CLIENT,
      system: SYSTEM,
      amount: usd(50),
      direction: 'credit_client',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.legs.some((leg) => leg.ledgerAccountId === SYSTEM.houseBank)).toBe(false)
    expect(result.value.legs.some((leg) => leg.ledgerAccountId === SYSTEM.brokerExpense)).toBe(true)
  })

  it('balances in both directions', () => {
    for (const direction of ['credit_client', 'debit_client'] as const) {
      const result = buildManualAdjustmentPosting({
        clientLedgerAccountId: CLIENT,
        system: SYSTEM,
        amount: usd(75.25),
        direction,
      })
      expect(result.ok).toBe(true)
      if (!result.ok) return
      expect(totals(result.value.legs)).toEqual({ debits: 75.25, credits: 75.25 })
    }
  })

  it('reverses which side the client sits on', () => {
    const creditResult = buildManualAdjustmentPosting({
      clientLedgerAccountId: CLIENT,
      system: SYSTEM,
      amount: usd(50),
      direction: 'credit_client',
    })
    const debitResult = buildManualAdjustmentPosting({
      clientLedgerAccountId: CLIENT,
      system: SYSTEM,
      amount: usd(50),
      direction: 'debit_client',
    })
    if (!creditResult.ok || !debitResult.ok) throw new Error('expected both postings to build')

    const creditLeg = creditResult.value.legs.find((l) => l.ledgerAccountId === CLIENT)
    const debitLeg = debitResult.value.legs.find((l) => l.ledgerAccountId === CLIENT)
    expect(creditLeg?.direction).toBe('credit')
    expect(debitLeg?.direction).toBe('debit')
  })
})
