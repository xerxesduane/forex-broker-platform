import type { AdapterResult } from '../shared/types'

export type SubmitApplicantRequest = {
  idempotencyKey: string
  clientId: string
  kycCaseId: string
  documentRefs: { docType: string; storagePath: string }[]
}

export type SubmitApplicantResponse = {
  vendorReferenceId: string
  receivedAt: string
}

/**
 * Represents a hosted-flow/SDK style KYC vendor (per the brief's
 * integration strategy). In this demo the vendor never issues its own
 * decision — the human KYC analyst always decides (docs/assumptions.md)
 * — so this adapter only models submission, not automated verdicts.
 */
export interface KycProviderAdapter {
  submitApplicant(req: SubmitApplicantRequest): Promise<AdapterResult<SubmitApplicantResponse>>
}
