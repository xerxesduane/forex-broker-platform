/** Mirrors public.money_movement_status. */
export type MoneyMovementStatus =
  'pending' | 'confirmed' | 'approved' | 'rejected' | 'paid' | 'failed' | 'reversed'

export type DepositEvent =
  | { type: 'PROVIDER_CONFIRMED' }
  | { type: 'PROVIDER_FAILED'; reason: string }
  | { type: 'APPROVE' }
  | { type: 'REJECT'; reason: string }

export type WithdrawalEvent =
  | { type: 'APPROVE' }
  | { type: 'REJECT'; reason: string }
  | { type: 'MARK_PAID' }
  | { type: 'FAIL'; reason: string }

/**
 * The subset of platform_settings the finance domain reads. Loaded from
 * the database at the boundary and passed in, so these rules stay
 * framework-free and testable (ADR 0002).
 */
export type FinanceSettings = {
  depositMin: number
  depositAutoCreditLimit: number
  withdrawalMin: number
  withdrawalFee: number
  withdrawalDualApprovalThreshold: number
}

export const DEPOSIT_METHODS = [
  { key: 'card', label: 'Debit / credit card', settlement: 'Instant (simulated)' },
  { key: 'bank_transfer', label: 'Bank transfer', settlement: '1–2 business days (simulated)' },
  { key: 'crypto_usdt', label: 'USDT (TRC-20)', settlement: 'Network confirmation (simulated)' },
  { key: 'skrill', label: 'Skrill', settlement: 'Instant (simulated)' },
] as const

export const WITHDRAWAL_METHODS = [
  { key: 'bank_transfer', label: 'Bank transfer', settlement: '1–3 business days (simulated)' },
  { key: 'card_refund', label: 'Refund to card', settlement: '3–5 business days (simulated)' },
  { key: 'crypto_usdt', label: 'USDT (TRC-20)', settlement: 'Same day (simulated)' },
] as const

export type DepositMethodKey = (typeof DEPOSIT_METHODS)[number]['key']
export type WithdrawalMethodKey = (typeof WITHDRAWAL_METHODS)[number]['key']

export function depositMethodLabel(key: string): string {
  return DEPOSIT_METHODS.find((m) => m.key === key)?.label ?? key
}

export function withdrawalMethodLabel(key: string): string {
  return WITHDRAWAL_METHODS.find((m) => m.key === key)?.label ?? key
}
