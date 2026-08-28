import type { AdapterResult } from '../shared/types'

export type SendEmailRequest = {
  idempotencyKey: string
  to: string
  template: 'welcome' | 'kyc_approved' | 'kyc_rejected' | 'demo_account_ready'
  data: Record<string, string>
}

export type SendEmailResponse = {
  providerMessageId: string
}

export interface EmailAdapter {
  send(req: SendEmailRequest): Promise<AdapterResult<SendEmailResponse>>
}
