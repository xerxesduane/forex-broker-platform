import type { AdapterResult } from '../shared/types'

export type UploadDocumentRequest = {
  idempotencyKey: string
  clientId: string
  kycCaseId: string
  docType: string
  originalFilename: string
  contentType: string
  fileBytes: Uint8Array
}

export type UploadDocumentResponse = {
  storagePath: string
  sizeBytes: number
}

export type SignedUrlResponse = {
  url: string
  expiresAt: string
}

/**
 * Private document storage. No identity-verification vendor sits behind
 * this — it is our own private Supabase Storage bucket (kyc-documents,
 * public = false, see supabase/migrations/...storage.sql), which is
 * genuinely exercised even though INTEGRATIONS_MODE=simulation, because
 * it is our own infrastructure rather than a third party. "Simulated" in
 * this build refers to there being no real identity-document vendor, not
 * to this storage call being faked.
 */
export interface DocumentStorageAdapter {
  upload(req: UploadDocumentRequest): Promise<AdapterResult<UploadDocumentResponse>>
  getSignedUrl(
    storagePath: string,
    expiresInSeconds?: number,
  ): Promise<AdapterResult<SignedUrlResponse>>
}
