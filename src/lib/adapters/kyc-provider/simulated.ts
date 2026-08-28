import { randomUUID } from 'node:crypto'
import { ok } from '@/domain/shared/result'
import type { AdapterResult, IntegrationEventRecorder } from '../shared/types'
import type { KycProviderAdapter, SubmitApplicantRequest, SubmitApplicantResponse } from './types'

export class SimulatedKycProviderAdapter implements KycProviderAdapter {
  constructor(private readonly recordEvent: IntegrationEventRecorder) {}

  async submitApplicant(
    req: SubmitApplicantRequest,
  ): Promise<AdapterResult<SubmitApplicantResponse>> {
    const response: SubmitApplicantResponse = {
      vendorReferenceId: `SIM-KYC-${randomUUID()}`,
      receivedAt: new Date().toISOString(),
    }

    await this.recordEvent({
      adapter: 'kyc_provider',
      eventType: 'submit_applicant',
      idempotencyKey: req.idempotencyKey,
      status: 'succeeded',
      simulation: true,
      requestSummary: { clientId: req.clientId, documentCount: req.documentRefs.length },
      responseSummary: response,
      relatedEntityType: 'kyc_case',
      relatedEntityId: req.kycCaseId,
    })

    return ok(response)
  }
}
