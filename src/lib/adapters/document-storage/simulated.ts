import type { SupabaseClient } from '@supabase/supabase-js'
import { err, ok } from '@/domain/shared/result'
import type { AdapterResult, IntegrationEventRecorder } from '../shared/types'
import type {
  DocumentStorageAdapter,
  SignedUrlResponse,
  UploadDocumentRequest,
  UploadDocumentResponse,
} from './types'

const BUCKET = process.env.DOCUMENT_STORAGE_BUCKET || 'kyc-documents'
const DEFAULT_SIGNED_URL_TTL_SECONDS = 300 // short-lived, per the security baseline

export class SupabaseDocumentStorageAdapter implements DocumentStorageAdapter {
  constructor(
    private readonly supabase: SupabaseClient,
    private readonly recordEvent: IntegrationEventRecorder,
  ) {}

  async upload(req: UploadDocumentRequest): Promise<AdapterResult<UploadDocumentResponse>> {
    const storagePath = `${req.clientId}/${req.kycCaseId}/${Date.now()}-${req.originalFilename}`

    const { error } = await this.supabase.storage.from(BUCKET).upload(storagePath, req.fileBytes, {
      contentType: req.contentType,
      upsert: false,
    })

    const adapterError = error
      ? { code: 'document_storage_upload_failed', message: error.message, retryable: true }
      : undefined

    await this.recordEvent({
      adapter: 'document_storage',
      eventType: 'upload',
      idempotencyKey: req.idempotencyKey,
      status: error ? 'failed' : 'succeeded',
      simulation: true,
      requestSummary: { docType: req.docType, contentType: req.contentType },
      responseSummary: error ? undefined : { storagePath, sizeBytes: req.fileBytes.byteLength },
      errorCode: adapterError?.code,
      errorMessage: adapterError?.message,
      relatedEntityType: 'kyc_case',
      relatedEntityId: req.kycCaseId,
    })

    if (adapterError) return err(adapterError)
    return ok({ storagePath, sizeBytes: req.fileBytes.byteLength })
  }

  async getSignedUrl(
    storagePath: string,
    expiresInSeconds = DEFAULT_SIGNED_URL_TTL_SECONDS,
  ): Promise<AdapterResult<SignedUrlResponse>> {
    const { data, error } = await this.supabase.storage
      .from(BUCKET)
      .createSignedUrl(storagePath, expiresInSeconds)

    if (error || !data) {
      return err({
        code: 'document_storage_sign_failed',
        message: error?.message ?? 'Could not create a signed URL.',
        retryable: true,
      })
    }

    return ok({
      url: data.signedUrl,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    })
  }
}
