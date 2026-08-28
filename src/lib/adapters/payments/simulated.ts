import { randomUUID } from 'node:crypto'
import { ok } from '@/domain/shared/result'
import type { AdapterResult, IntegrationEventRecorder } from '../shared/types'
import type {
  CreateDepositIntentRequest,
  CreateDepositIntentResponse,
  CreateWithdrawalRequest,
  CreateWithdrawalResponse,
  PaymentsAdapter,
} from './types'

export class SimulatedPaymentsAdapter implements PaymentsAdapter {
  constructor(private readonly recordEvent: IntegrationEventRecorder) {}

  async createDepositIntent(
    req: CreateDepositIntentRequest,
  ): Promise<AdapterResult<CreateDepositIntentResponse>> {
    const response: CreateDepositIntentResponse = {
      providerRef: `SIM-DEP-${randomUUID()}`,
      status: 'pending',
      instructions: 'Demo payment provider — no real funds are moved.',
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

  async createWithdrawal(
    req: CreateWithdrawalRequest,
  ): Promise<AdapterResult<CreateWithdrawalResponse>> {
    const response: CreateWithdrawalResponse = {
      providerRef: `SIM-WD-${randomUUID()}`,
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
}
