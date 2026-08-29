'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { kycDecisionSchema } from '@/domain/kyc/decision-schema'
import { kycSubmissionSchema } from '@/domain/kyc/schema'
import { transitionKycStatus } from '@/domain/kyc/state-machine'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { createAdapters } from '@/lib/adapters'
import { writeAuditEvent } from '@/lib/audit'
import { getActingStaff } from '@/lib/auth/current-user'
import { notifyClient } from '@/lib/notify'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'

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

// ---------------------------------------------------------------------------
// Analyst review tooling
// ---------------------------------------------------------------------------

/**
 * Claim a case for review. Recorded as an assignment plus an audit event so
 * "who was looking at this" is answerable months later — the question a
 * compliance review actually asks.
 */
export async function claimKycCase(
  kycCaseId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.KYC_REVIEW)

  const staff = await getActingStaff(supabase)
  if (!staff) return { ok: false, error: 'Staff session not found.' }

  const { data: kycCase } = await supabase
    .from('kyc_cases')
    .select('id, status, analyst_id')
    .eq('id', kycCaseId)
    .single()
  if (!kycCase) return { ok: false, error: 'KYC case not found.' }

  if (kycCase.analyst_id && kycCase.analyst_id !== staff.id) {
    return { ok: false, error: 'Another analyst is already reviewing this case.' }
  }

  const transition =
    kycCase.status === 'submitted'
      ? transitionKycStatus(kycCase.status, { type: 'START_REVIEW' })
      : { ok: true as const, value: kycCase.status as string }

  const updates: Record<string, unknown> = {
    analyst_id: staff.id,
    claimed_at: new Date().toISOString(),
  }
  if (transition.ok && transition.value !== kycCase.status) {
    updates.status = transition.value
  }

  const { error } = await supabase.from('kyc_cases').update(updates).eq('id', kycCaseId)
  if (error) return { ok: false, error: error.message }

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'kyc.claimed',
    entityType: 'kyc_case',
    entityId: kycCaseId,
    beforeState: { status: kycCase.status, analystId: kycCase.analyst_id },
    afterState: updates,
  })

  revalidatePath('/admin/kyc')
  revalidatePath(`/admin/kyc/${kycCaseId}`)
  return { ok: true }
}

/** Accept or reject one document, with a note the analyst can point at. */
export async function reviewKycDocument(input: {
  documentId: string
  reviewStatus: 'accepted' | 'rejected'
  note?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.KYC_REVIEW)

  const staff = await getActingStaff(supabase)
  if (!staff) return { ok: false, error: 'Staff session not found.' }

  if (input.reviewStatus === 'rejected' && (input.note ?? '').trim().length < 4) {
    return { ok: false, error: 'Rejecting a document needs a short note explaining why.' }
  }

  const { data: document } = await supabase
    .from('kyc_documents')
    .select('id, kyc_case_id, doc_type, review_status')
    .eq('id', input.documentId)
    .single()
  if (!document) return { ok: false, error: 'Document not found.' }

  const { error } = await supabase
    .from('kyc_documents')
    .update({
      review_status: input.reviewStatus,
      reviewed_by: staff.id,
      review_note: input.note ?? null,
    })
    .eq('id', input.documentId)
  if (error) return { ok: false, error: error.message }

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'kyc.document_reviewed',
    entityType: 'kyc_document',
    entityId: input.documentId,
    reason: input.note,
    beforeState: { reviewStatus: document.review_status },
    afterState: { reviewStatus: input.reviewStatus, docType: document.doc_type },
  })

  revalidatePath(`/admin/kyc/${document.kyc_case_id}`)
  return { ok: true }
}

/** Send a case back to the client for more information. */
export async function requestKycRevision(
  kycCaseId: string,
  reason: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  if (reason.trim().length < 10) {
    return {
      ok: false,
      error: 'Tell the client what to fix in at least 10 characters — they see this message.',
    }
  }

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.KYC_REVIEW)

  const staff = await getActingStaff(supabase)
  if (!staff) return { ok: false, error: 'Staff session not found.' }

  const { data: kycCase } = await supabase
    .from('kyc_cases')
    .select('id, client_id, status')
    .eq('id', kycCaseId)
    .single()
  if (!kycCase) return { ok: false, error: 'KYC case not found.' }

  const transition = transitionKycStatus(kycCase.status, { type: 'REQUEST_REVISION', reason })
  if (!transition.ok) return { ok: false, error: transition.error.message }

  const { error } = await supabase
    .from('kyc_cases')
    .update({ status: transition.value, decision_reason: reason })
    .eq('id', kycCaseId)
  if (error) return { ok: false, error: error.message }

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'kyc.revision_requested',
    entityType: 'kyc_case',
    entityId: kycCaseId,
    reason,
    beforeState: { status: kycCase.status },
    afterState: { status: transition.value },
  })

  const serviceRole = createSupabaseServiceRoleClient()
  await notifyClient(serviceRole, {
    profileId: kycCase.client_id as string,
    type: 'kyc_needs_revision',
    title: 'More information needed',
    body: `Our compliance team needs something else before approving your verification: ${reason}`,
    payload: { kycCaseId },
  })

  revalidatePath('/admin/kyc')
  revalidatePath(`/admin/kyc/${kycCaseId}`)
  revalidatePath('/portal/kyc')
  return { ok: true }
}

/** Attach or clear internal risk flags on a case. */
export async function setKycRiskFlags(
  kycCaseId: string,
  flags: string[],
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.KYC_REVIEW)

  const staff = await getActingStaff(supabase)
  if (!staff) return { ok: false, error: 'Staff session not found.' }

  const { data: kycCase } = await supabase
    .from('kyc_cases')
    .select('id, risk_flags')
    .eq('id', kycCaseId)
    .single()
  if (!kycCase) return { ok: false, error: 'KYC case not found.' }

  const cleaned = [...new Set(flags.map((flag) => flag.trim()).filter(Boolean))].slice(0, 12)

  const { error } = await supabase
    .from('kyc_cases')
    .update({ risk_flags: cleaned })
    .eq('id', kycCaseId)
  if (error) return { ok: false, error: error.message }

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'kyc.risk_flags_updated',
    entityType: 'kyc_case',
    entityId: kycCaseId,
    beforeState: { riskFlags: kycCase.risk_flags },
    afterState: { riskFlags: cleaned },
  })

  revalidatePath(`/admin/kyc/${kycCaseId}`)
  return { ok: true }
}
