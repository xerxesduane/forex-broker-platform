import { randomUUID } from 'node:crypto'
import { ok } from '@/domain/shared/result'
import type { AdapterResult, IntegrationEventRecorder } from '../shared/types'
import type { SendSmsRequest, SendSmsResponse, SmsAdapter } from './types'

export class SimulatedSmsAdapter implements SmsAdapter {
  constructor(private readonly recordEvent: IntegrationEventRecorder) {}

  async send(req: SendSmsRequest): Promise<AdapterResult<SendSmsResponse>> {
    const response: SendSmsResponse = { providerMessageId: `SIM-SMS-${randomUUID()}` }

    console.log(`[simulated-sms] to=${req.toPhoneNumber}: ${req.body}`)

    await this.recordEvent({
      adapter: 'sms',
      eventType: 'send',
      idempotencyKey: req.idempotencyKey,
      status: 'succeeded',
      simulation: true,
      requestSummary: { toPhoneNumber: req.toPhoneNumber },
      responseSummary: response,
    })

    return ok(response)
  }
}
