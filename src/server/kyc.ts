'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { kycDecisionSchema } from '@/domain/kyc/decision-schema'
import { kycSubmissionSchema } from '@/domain/kyc/schema'
import { transitionKycStatus } from '@/domain/kyc/state-machine'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { createAdapters } from '@/lib/adapters'
import { writeAuditEvent } from '@/lib/audit'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type SubmitKycResult = { ok: true; kycCaseId: string } | { ok: false; error: string }

const MAX_DOCUMENT_BYTES = 10 * 1024 * 1024

export async function submitKyc(formData: FormData): Promise<SubmitKycResult> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('profile_completed_at, kyc_status')
    .eq('id', user.id)
    .single()

  if (!profile?.profile_completed_at) {
    return { ok: false, error: 'Complete your profile before submitting KYC.' }
  }

  const transition = transitionKycStatus(profile.kyc_status, { type: 'SUBMIT' })
  if (!transition.ok) {
    return { ok: false, error: transition.error.message }
  }

  const parsed = kycSubmissionSchema.safeParse({
    employmentStatus: formData.get('employmentStatus'),
    sourceOfFunds: formData.get('sourceOfFunds'),
    declaredCountry: formData.get('declaredCountry'),
    accurateInfoConfirmed: formData.get('accurateInfoConfirmed') === 'true',
  })
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid submission.' }
  }

  const file = formData.get('document')
  if (!(file instanceof File) || file.size === 0) {
    return { ok: false, error: 'Attach a document to continue.' }
  }
  if (file.size > MAX_DOCUMENT_BYTES) {
    return { ok: false, error: 'File must be 10MB or smaller.' }
  }

  const { data: kycCase, error: insertError } = await supabase
    .from('kyc_cases')
    .insert({
      client_id: user.id,
      employment_status: parsed.data.employmentStatus,
      source_of_funds: parsed.data.sourceOfFunds,
      declared_country: parsed.data.declaredCountry,
    })
    .select('id')
    .single()

  if (insertError || !kycCase) {
    return {
      ok: false,
      error:
        insertError?.code === '23505'
          ? 'You already have a KYC submission in progress.'
          : (insertError?.message ?? 'Could not create your KYC case.'),
    }
  }

  const adapters = createAdapters(supabase)
  const fileBytes = new Uint8Array(await file.arrayBuffer())

  const uploadResult = await adapters.documentStorage.upload({
    idempotencyKey: randomUUID(),
    clientId: user.id,
    kycCaseId: kycCase.id,
    docType: 'identity_document',
    originalFilename: file.name,
    contentType: file.type || 'application/octet-stream',
    fileBytes,
  })

  if (!uploadResult.ok) {
    return { ok: false, error: 'Could not store your document. Please try again.' }
  }

  await supabase.from('kyc_documents').insert({
    kyc_case_id: kycCase.id,
    doc_type: 'identity_document',
    storage_path: uploadResult.value.storagePath,
    original_filename: file.name,
    content_type: file.type || 'application/octet-stream',
    size_bytes: uploadResult.value.sizeBytes,
  })

  await adapters.kycProvider.submitApplicant({
    idempotencyKey: randomUUID(),
    clientId: user.id,
    kycCaseId: kycCase.id,
    documentRefs: [{ docType: 'identity_document', storagePath: uploadResult.value.storagePath }],
  })

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'kyc.submit',
    entityType: 'kyc_case',
    entityId: kycCase.id,
    afterState: { status: 'submitted' },
  })

  revalidatePath('/portal/kyc')
  revalidatePath('/portal')
  return { ok: true, kycCaseId: kycCase.id }
}

export type DecideKycResult = { ok: true } | { ok: false; error: string }

export async function decideKyc(
  kycCaseId: string,
  decisionInput: unknown,
): Promise<DecideKycResult> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  await requirePermission(supabase, PERMISSIONS.KYC_DECIDE)

  const parsed = kycDecisionSchema.safeParse(decisionInput)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid decision.' }
  }

  const { data: kycCase, error: fetchError } = await supabase
    .from('kyc_cases')
    .select('id, client_id, status')
    .eq('id', kycCaseId)
    .single()

  if (fetchError || !kycCase) return { ok: false, error: 'KYC case not found.' }

  const event: { type: 'APPROVE'; reason?: string } | { type: 'REJECT'; reason: string } =
    parsed.data.decision === 'approve'
      ? { type: 'APPROVE', reason: parsed.data.reason }
      : { type: 'REJECT', reason: parsed.data.reason }

  const transition = transitionKycStatus(kycCase.status, event)
  if (!transition.ok) {
    return { ok: false, error: transition.error.message }
  }

  const decidedAt = new Date().toISOString()
  const { error: updateError } = await supabase
    .from('kyc_cases')
    .update({
      status: transition.value,
      decided_at: decidedAt,
      decided_by: user.id,
      decision_reason: parsed.data.reason ?? null,
    })
    .eq('id', kycCaseId)

  if (updateError) return { ok: false, error: updateError.message }

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'kyc_analyst',
    action: 'kyc.decide',
    entityType: 'kyc_case',
    entityId: kycCaseId,
    reason: parsed.data.reason,
    beforeState: { status: kycCase.status },
    afterState: { status: transition.value },
  })

  await supabase.from('notifications').insert({
    profile_id: kycCase.client_id,
    type: transition.value === 'approved' ? 'kyc_approved' : 'kyc_rejected',
    title: transition.value === 'approved' ? 'KYC approved' : 'KYC application rejected',
    body:
      transition.value === 'approved'
        ? 'Your demo KYC application has been approved. You can now request a demo trading account.'
        : `Your demo KYC application was rejected: ${parsed.data.reason ?? ''}`,
    payload: { kycCaseId },
  })

  revalidatePath(`/admin/kyc/${kycCaseId}`)
  revalidatePath('/admin/kyc')
  return { ok: true }
}
