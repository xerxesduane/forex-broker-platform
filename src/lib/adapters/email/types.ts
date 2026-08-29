import type { AdapterResult } from '../shared/types'

export type SendEmailRequest = {
  idempotencyKey: string
  to: string
  /**
   * A key from public.email_templates. Kept as a string rather than a
   * union because the templates are database rows an administrator edits,
   * not a compile-time list.
   */
  template: string
  data: Record<string, string>
  /** Rendered by the caller from the template row, when one was found. */
  subject?: string
  body?: string
}

export type SendEmailResponse = {
  providerMessageId: string
}

export interface EmailAdapter {
  send(req: SendEmailRequest): Promise<AdapterResult<SendEmailResponse>>
}
