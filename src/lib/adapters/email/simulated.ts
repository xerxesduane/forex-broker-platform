import { randomUUID } from 'node:crypto'
import { ok } from '@/domain/shared/result'
import type { AdapterResult, IntegrationEventRecorder } from '../shared/types'
import type { EmailAdapter, SendEmailRequest, SendEmailResponse } from './types'

/**
 * Simulated transactional email: writes to the console + integration_events
 * "outbox" instead of calling a real provider. Supabase Auth handles its
 * own verification/reset emails separately (its own SMTP config) — this
 * adapter is for Aurion Markets' own notifications (KYC decisions, etc.).
 */
export class SimulatedEmailAdapter implements EmailAdapter {
  constructor(private readonly recordEvent: IntegrationEventRecorder) {}

  async send(req: SendEmailRequest): Promise<AdapterResult<SendEmailResponse>> {
    const response: SendEmailResponse = { providerMessageId: `SIM-EMAIL-${randomUUID()}` }

    console.log(`[simulated-email] to=${req.to} template=${req.template}`, req.data)

    await this.recordEvent({
      adapter: 'email',
      eventType: `send_${req.template}`,
      idempotencyKey: req.idempotencyKey,
      status: 'succeeded',
      simulation: true,
      requestSummary: { to: req.to, template: req.template },
      responseSummary: response,
    })

    return ok(response)
  }
}
