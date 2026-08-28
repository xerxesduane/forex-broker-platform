import type { AdapterResult } from '../shared/types'

export type SendSmsRequest = {
  idempotencyKey: string
  toPhoneNumber: string
  body: string
}

export type SendSmsResponse = {
  providerMessageId: string
}

export interface SmsAdapter {
  send(req: SendSmsRequest): Promise<AdapterResult<SendSmsResponse>>
}
