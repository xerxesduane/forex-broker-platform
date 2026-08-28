import type { AdapterResult } from '../shared/types'

export type CreateDepositIntentRequest = {
  idempotencyKey: string
  walletId: string
  amount: number
  currency: string
  method: string
}

export type CreateDepositIntentResponse = {
  providerRef: string
  status: 'pending' | 'confirmed'
  instructions: string
}

export type CreateWithdrawalRequest = {
  idempotencyKey: string
  walletId: string
  amount: number
  currency: string
  method: string
}

export type CreateWithdrawalResponse = {
  providerRef: string
  status: 'pending'
}

/**
 * Not wired to any UI flow in this build (money movement is Phase 4, per
 * docs/product-plan.md) — the interface exists now so the finance
 * schema/adapters land together and nothing changes shape later.
 */
export interface PaymentsAdapter {
  createDepositIntent(
    req: CreateDepositIntentRequest,
  ): Promise<AdapterResult<CreateDepositIntentResponse>>
  createWithdrawal(req: CreateWithdrawalRequest): Promise<AdapterResult<CreateWithdrawalResponse>>
}
