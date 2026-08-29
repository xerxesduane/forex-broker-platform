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

/**
 * Stands in for the provider webhook a live integration would receive.
 * In this build an operator (or the client) triggers it explicitly from
 * the UI, which makes the settlement step visible rather than magic.
 */
export type ConfirmDepositIntentRequest = {
  idempotencyKey: string
  providerRef: string
  amount: number
  currency: string
}

export type ConfirmDepositIntentResponse = {
  providerRef: string
  status: 'confirmed' | 'failed'
  settledAt: string
  /** Provider's own fee, reported for reconciliation. */
  providerFee: number
}

export type CreateWithdrawalRequest = {
  idempotencyKey: string
  walletId: string
  amount: number
  currency: string
  method: string
  payoutDetail: string
}

export type CreateWithdrawalResponse = {
  providerRef: string
  status: 'pending'
}

export type SendPayoutRequest = {
  idempotencyKey: string
  providerRef: string
  amount: number
  currency: string
  method: string
}

export type SendPayoutResponse = {
  providerRef: string
  status: 'paid'
  paidAt: string
}

export interface PaymentsAdapter {
  createDepositIntent(
    req: CreateDepositIntentRequest,
  ): Promise<AdapterResult<CreateDepositIntentResponse>>

  confirmDepositIntent(
    req: ConfirmDepositIntentRequest,
  ): Promise<AdapterResult<ConfirmDepositIntentResponse>>

  createWithdrawal(req: CreateWithdrawalRequest): Promise<AdapterResult<CreateWithdrawalResponse>>

  sendPayout(req: SendPayoutRequest): Promise<AdapterResult<SendPayoutResponse>>
}
