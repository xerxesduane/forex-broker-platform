import { randomUUID } from 'node:crypto'
import { ok } from '@/domain/shared/result'
import type { AdapterResult, IntegrationEventRecorder } from '../shared/types'
import type {
  ConfirmDepositIntentRequest,
  ConfirmDepositIntentResponse,
  CreateDepositIntentRequest,
  CreateDepositIntentResponse,
  CreateWithdrawalRequest,
  CreateWithdrawalResponse,
  PaymentsAdapter,
  SendPayoutRequest,
  SendPayoutResponse,
} from './types'

/** Provider fee basis points by method — purely illustrative demo figures. */
const PROVIDER_FEE_BPS: Record<string, number> = {
  card: 190,
  bank_transfer: 0,
  crypto_usdt: 50,
  skrill: 250,
}

const INSTRUCTIONS: Record<string, string> = {
  card: 'Demo card checkout — no card details are collected and no funds move.',
  bank_transfer:
    'Demo bank transfer — reference AURION-DEMO. No real account details are shown or needed.',
  crypto_usdt: 'Demo USDT (TRC-20) address — simulated network, no wallet is generated.',
  skrill: 'Demo Skrill redirect — no real Skrill account is contacted.',
}

/**
 * Simulated payment provider. Every method is deterministic, records an
 * integration_events row, and never reads PAYMENTS_PROVIDER_* credentials
 * (ADR 0005). No real money moves at any point in this build.
 */
export class SimulatedPaymentsAdapter implements PaymentsAdapter {
  constructor(private readonly recordEvent: IntegrationEventRecorder) {}

  async createDepositIntent(
    req: CreateDepositIntentRequest,
  ): Promise<AdapterResult<CreateDepositIntentResponse>> {
    const response: CreateDepositIntentResponse = {
      providerRef: `SIM-DEP-${randomUUID().slice(0, 13).toUpperCase()}`,
      status: 'pending',
      instructions: INSTRUCTIONS[req.method] ?? 'Demo payment provider — no real funds are moved.',
    }
    await this.recordEvent({
      adapter: 'payments',
      eventType: 'create_deposit_intent',
      idempotencyKey: req.idempotencyKey,
      status: 'succeeded',
      simulation: true,
      requestSummary: { amount: req.amount, currency: req.currency, method: req.method },
      responseSummary: response,
      relatedEntityType: 'wallet',
      relatedEntityId: req.walletId,
    })
    return ok(response)
  }

  async confirmDepositIntent(
    req: ConfirmDepositIntentRequest,
  ): Promise<AdapterResult<ConfirmDepositIntentResponse>> {
    const response: ConfirmDepositIntentResponse = {
      providerRef: req.providerRef,
      status: 'confirmed',
      settledAt: new Date().toISOString(),
      providerFee: 0,
    }
    await this.recordEvent({
      adapter: 'payments',
      eventType: 'confirm_deposit_intent',
      idempotencyKey: req.idempotencyKey,
      status: 'succeeded',
      simulation: true,
      requestSummary: { providerRef: req.providerRef, amount: req.amount },
      responseSummary: response,
    })
    return ok(response)
  }

  async createWithdrawal(
    req: CreateWithdrawalRequest,
  ): Promise<AdapterResult<CreateWithdrawalResponse>> {
    const response: CreateWithdrawalResponse = {
      providerRef: `SIM-WD-${randomUUID().slice(0, 13).toUpperCase()}`,
      status: 'pending',
    }
    await this.recordEvent({
      adapter: 'payments',
      eventType: 'create_withdrawal',
      idempotencyKey: req.idempotencyKey,
      status: 'succeeded',
      simulation: true,
      requestSummary: { amount: req.amount, currency: req.currency, method: req.method },
      responseSummary: response,
      relatedEntityType: 'wallet',
      relatedEntityId: req.walletId,
    })
    return ok(response)
  }

  async sendPayout(req: SendPayoutRequest): Promise<AdapterResult<SendPayoutResponse>> {
    const response: SendPayoutResponse = {
      providerRef: req.providerRef,
      status: 'paid',
      paidAt: new Date().toISOString(),
    }
    await this.recordEvent({
      adapter: 'payments',
      eventType: 'send_payout',
      idempotencyKey: req.idempotencyKey,
      status: 'succeeded',
      simulation: true,
      requestSummary: { amount: req.amount, currency: req.currency, method: req.method },
      responseSummary: response,
    })
    return ok(response)
  }
}

/** Illustrative provider fee, shown on the reconciliation screen. */
export function estimateProviderFee(method: string, amount: number): number {
  const bps = PROVIDER_FEE_BPS[method] ?? 0
  return Math.round(((amount * bps) / 10_000) * 100) / 100
}
