'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { buildCommissionPayoutPosting, buildRebatePosting } from '@/domain/ledger/posting'
import { canAttributeReferral } from '@/domain/growth/commission'
import {
  commissionDecisionSchema,
  ibApplicationSchema,
  ibStatusSchema,
} from '@/domain/growth/schema'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { fromMajorUnits } from '@/domain/shared/money'
import { writeAuditEvent } from '@/lib/audit'
import { getActingStaff } from '@/lib/auth/current-user'
import { loadSystemLedgerAccounts, loadWallet, postTransaction } from '@/lib/ledger'
import { notifyClient } from '@/lib/notify'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'

export type ActionResult<T = void> = { ok: true; value?: T } | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/** Client-initiated: apply to the Introducing Broker programme. */
export async function applyForIbProgramme(
  input: unknown,
): Promise<ActionResult<{ ibCode: string; status: string }>> {
  const parsed = ibApplicationSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid application.')

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('kyc_status, account_status, referral_code')
    .eq('id', user.id)
    .single()
  if (!profile) return fail('Profile not found.')

  if (profile.kyc_status !== 'approved') {
    return fail('Your identity verification must be approved before applying to the programme.')
  }
  if (profile.account_status !== 'active') {
    return fail('Your account must be in good standing to apply.')
  }

  const serviceRole = createSupabaseServiceRoleClient()

  const { data: existing } = await serviceRole
    .from('introducing_brokers')
    .select('id, ib_code, status')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (existing) {
    return fail(
      `You already have a partner application (${existing.ib_code}, status: ${existing.status}).`,
    )
  }

  // The partner code is the client's own reference — one identifier for a
  // person, whichever side of the programme they are on.
  const ibCode = (profile.referral_code as string) ?? `AM-${randomUUID().slice(0, 6).toUpperCase()}`

  const { data: bronze } = await serviceRole
    .from('ranks')
    .select('id')
    .eq('key', 'bronze')
    .maybeSingle()

  const { data: ib, error } = await serviceRole
    .from('introducing_brokers')
    .insert({
      profile_id: user.id,
      ib_code: ibCode,
      rank_id: bronze?.id ?? null,
      // Applications queue for review — a partner programme that
      // self-approves is a compliance finding waiting to happen.
      status: 'pending',
    })
    .select('id, ib_code, status')
    .single()

  if (error || !ib) return fail(error?.message ?? 'Could not submit your application.')

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'ib.application_submitted',
    entityType: 'introducing_broker',
    entityId: ib.id,
    afterState: {
      ibCode: ib.ib_code,
      status: ib.status,
      channel: parsed.data.websiteOrChannel,
      expectedMonthlyReferrals: parsed.data.expectedMonthlyReferrals,
    },
  })

  revalidatePath('/portal/referrals')
  revalidatePath('/admin/partners')
  return { ok: true, value: { ibCode: ib.ib_code as string, status: ib.status as string } }
}

/** Staff: approve, suspend or re-rate a partner. */
export async function setIbStatus(input: unknown): Promise<ActionResult> {
  const parsed = ibStatusSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid change.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.REFERRAL_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: ib } = await supabase
    .from('introducing_brokers')
    .select('id, profile_id, ib_code, status, commission_bps')
    .eq('id', parsed.data.ibId)
    .single()
  if (!ib) return fail('Partner not found.')

  const { error } = await supabase
    .from('introducing_brokers')
    .update({
      status: parsed.data.status,
      commission_bps: parsed.data.commissionBps,
      approved_by: staff.id,
    })
    .eq('id', parsed.data.ibId)
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'ib.status_changed',
    entityType: 'introducing_broker',
    entityId: parsed.data.ibId,
    reason: parsed.data.reason,
    beforeState: { status: ib.status, commissionBps: ib.commission_bps },
    afterState: { status: parsed.data.status, commissionBps: parsed.data.commissionBps },
  })

  const serviceRole = createSupabaseServiceRoleClient()
  await notifyClient(serviceRole, {
    profileId: ib.profile_id as string,
    type: 'ib_status_changed',
    title:
      parsed.data.status === 'active'
        ? 'Partner account approved'
        : `Partner account ${parsed.data.status}`,
    body:
      parsed.data.status === 'active'
        ? `Your partner account ${ib.ib_code} is active at ${parsed.data.commissionBps}bp. Share your referral link to start earning.`
        : `Your partner account ${ib.ib_code} is now ${parsed.data.status}. ${parsed.data.reason ?? ''}`,
    payload: { ibId: parsed.data.ibId },
  })

  revalidatePath('/admin/partners')
  revalidatePath('/portal/referrals')
  return { ok: true }
}

/**
 * Staff: approve or void a pending commission. Approval makes it payable;
 * it does not move money — that is payCommission below, so the
 * "who approved" and "who paid" steps stay separable.
 */
export async function decideCommission(input: unknown): Promise<ActionResult> {
  const parsed = commissionDecisionSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid decision.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.COMMISSION_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: commission } = await supabase
    .from('commissions')
    .select('id, ib_id, amount, currency, status')
    .eq('id', parsed.data.commissionId)
    .single()
  if (!commission) return fail('Commission not found.')

  if (commission.status !== 'pending') {
    return fail(`This commission is already ${commission.status}.`)
  }

  const nextStatus = parsed.data.decision === 'approve' ? 'approved' : 'void'

  const { error } = await supabase
    .from('commissions')
    .update({ status: nextStatus, approved_by: staff.id, decided_at: new Date().toISOString() })
    .eq('id', parsed.data.commissionId)
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: `commission.${nextStatus}`,
    entityType: 'commission',
    entityId: parsed.data.commissionId,
    reason: parsed.data.reason,
    beforeState: { status: commission.status },
    afterState: { status: nextStatus },
  })

  revalidatePath('/admin/partners')
  return { ok: true }
}

/** Staff: pay an approved commission into the partner's wallet. */
export async function payCommission(commissionId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.COMMISSION_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: commission } = await supabase
    .from('commissions')
    .select('id, ib_id, amount, currency, status, paid_transaction_id')
    .eq('id', commissionId)
    .single()
  if (!commission) return fail('Commission not found.')
  if (commission.status !== 'approved') {
    return fail('Only an approved commission can be paid.')
  }
  if (commission.paid_transaction_id) return { ok: true }

  const serviceRole = createSupabaseServiceRoleClient()

  const { data: ib } = await serviceRole
    .from('introducing_brokers')
    .select('id, profile_id, ib_code')
    .eq('id', commission.ib_id as string)
    .single()
  if (!ib) return fail('Partner not found.')

  const wallet = await loadWallet(
    serviceRole,
    ib.profile_id as string,
    commission.currency as string,
  )
  if (!wallet) return fail('That partner has no wallet in this currency.')

  const system = await loadSystemLedgerAccounts(serviceRole)
  const posting = buildCommissionPayoutPosting({
    ibLedgerAccountId: wallet.ledgerAccountId,
    system,
    amount: fromMajorUnits(Number(commission.amount), commission.currency as string),
  })
  if (!posting.ok) return fail(posting.error.message)

  const posted = await postTransaction(serviceRole, {
    type: 'commission',
    posting: posting.value,
    idempotencyKey: `commission:${commissionId}`,
    externalRef: `Commission payout to ${ib.ib_code}`,
  })
  if (!posted.ok) return fail(posted.error.message)

  await serviceRole
    .from('commissions')
    .update({ status: 'paid', paid_transaction_id: posted.value })
    .eq('id', commissionId)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'commission.paid',
    entityType: 'commission',
    entityId: commissionId,
    beforeState: { status: 'approved' },
    afterState: { status: 'paid', transactionId: posted.value, amount: Number(commission.amount) },
  })

  await notifyClient(serviceRole, {
    profileId: ib.profile_id as string,
    type: 'commission_paid',
    title: 'Commission paid',
    body: `${commission.amount} ${commission.currency} commission has been credited to your wallet. Simulated funds.`,
    payload: { commissionId, transactionId: posted.value },
  })

  revalidatePath('/admin/partners')
  revalidatePath('/portal/referrals')
  return { ok: true }
}

/** Staff: pay an approved client rebate. */
export async function payRebate(rebateId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.COMMISSION_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: rebate } = await supabase
    .from('rebates')
    .select('id, client_id, amount, currency, status, paid_transaction_id')
    .eq('id', rebateId)
    .single()
  if (!rebate) return fail('Rebate not found.')
  if (rebate.paid_transaction_id) return { ok: true }
  if (rebate.status === 'void') return fail('This rebate has been voided.')

  const serviceRole = createSupabaseServiceRoleClient()
  const wallet = await loadWallet(
    serviceRole,
    rebate.client_id as string,
    rebate.currency as string,
  )
  if (!wallet) return fail('That client has no wallet in this currency.')

  const system = await loadSystemLedgerAccounts(serviceRole)
  const posting = buildRebatePosting({
    clientLedgerAccountId: wallet.ledgerAccountId,
    system,
    amount: fromMajorUnits(Number(rebate.amount), rebate.currency as string),
  })
  if (!posting.ok) return fail(posting.error.message)

  const posted = await postTransaction(serviceRole, {
    type: 'rebate',
    posting: posting.value,
    idempotencyKey: `rebate:${rebateId}`,
    externalRef: 'Client rebate',
  })
  if (!posted.ok) return fail(posted.error.message)

  await serviceRole
    .from('rebates')
    .update({ status: 'paid', paid_transaction_id: posted.value })
    .eq('id', rebateId)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'rebate.paid',
    entityType: 'rebate',
    entityId: rebateId,
    afterState: { status: 'paid', transactionId: posted.value, amount: Number(rebate.amount) },
  })

  await notifyClient(serviceRole, {
    profileId: rebate.client_id as string,
    type: 'rebate_paid',
    title: 'Rebate credited',
    body: `${rebate.amount} ${rebate.currency} rebate has been credited to your wallet. Simulated funds.`,
    payload: { rebateId },
  })

  revalidatePath('/admin/partners')
  revalidatePath('/portal/wallet')
  return { ok: true }
}

/**
 * Staff: attribute a client to a partner. Self-referral and re-attributing
 * an already-claimed client are both refused by the domain rule.
 */
export async function attributeReferral(input: {
  ibId: string
  clientId: string
  reason?: string
}): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.REFERRAL_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: ib } = await supabase
    .from('introducing_brokers')
    .select('id, profile_id, ib_code')
    .eq('id', input.ibId)
    .single()
  if (!ib) return fail('Partner not found.')

  const { data: existing } = await supabase
    .from('referral_relationships')
    .select('referrer_id')
    .eq('referee_id', input.clientId)
    .maybeSingle()

  const check = canAttributeReferral({
    referrerId: ib.profile_id as string,
    refereeId: input.clientId,
    existingReferrerId: (existing?.referrer_id as string) ?? null,
  })
  if (!check.ok) return fail(check.error.message)

  const { error } = await supabase.from('referral_relationships').insert({
    referrer_id: ib.profile_id as string,
    referee_id: input.clientId,
    ib_id: ib.id as string,
  })
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'referral.attributed',
    entityType: 'profile',
    entityId: input.clientId,
    reason: input.reason,
    afterState: { ibId: ib.id, ibCode: ib.ib_code },
  })

  revalidatePath('/admin/partners')
  return { ok: true }
}
