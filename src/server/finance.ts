'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import {
  depositRequestSchema,
  internalTransferSchema,
  manualAdjustmentSchema,
  moneyMovementDecisionSchema,
  reverseTransactionSchema,
  withdrawalRequestSchema,
} from '@/domain/finance/schema'
import {
  checkDepositEligibility,
  requiresManualApproval,
  transitionDeposit,
} from '@/domain/finance/deposit'
import type { MoneyMovementStatus } from '@/domain/finance/types'
import { withdrawalMethodLabel } from '@/domain/finance/types'
import {
  evaluateApproval,
  quoteWithdrawal,
  transitionWithdrawal,
} from '@/domain/finance/withdrawal'
import {
  buildDepositPosting,
  buildInternalTransferPosting,
  buildManualAdjustmentPosting,
  buildWithdrawalPayoutPosting,
  buildWithdrawalReservationPosting,
} from '@/domain/ledger/posting'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { fromMajorUnits, toMajorUnits } from '@/domain/shared/money'
import { createAdapters } from '@/lib/adapters'
import { writeAuditEvent } from '@/lib/audit'
import { getActingStaff } from '@/lib/auth/current-user'
import {
  loadSystemLedgerAccounts,
  loadWallet,
  postTransaction,
  reverseTransaction as reverseLedgerTransaction,
} from '@/lib/ledger'
import { notifyClient, sendTemplatedEmail } from '@/lib/notify'
import { requirePermission } from '@/lib/rbac/require-permission'
import { loadFinanceSettings } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'

export type ActionResult<T = void> = { ok: true; value?: T } | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

function reference(prefix: string): string {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`
}

// ---------------------------------------------------------------------------
// Client-initiated: request a deposit
// ---------------------------------------------------------------------------

export async function requestDeposit(
  input: unknown,
): Promise<ActionResult<{ depositId: string; providerRef: string; instructions: string }>> {
  const parsed = depositRequestSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request.')

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('kyc_status, account_status, email, first_name')
    .eq('id', user.id)
    .single()
  if (!profile) return fail('Profile not found.')

  const wallet = await loadWallet(supabase, user.id)
  if (!wallet) return fail('No wallet found for your account.')

  const settings = await loadFinanceSettings(supabase)
  const amount = fromMajorUnits(parsed.data.amount, wallet.currency)

  const eligibility = checkDepositEligibility({
    amount,
    settings,
    accountStatus: profile.account_status as string,
    kycStatus: profile.kyc_status as string,
  })
  if (!eligibility.ok) return fail(eligibility.error.message)

  // Ask the (simulated) provider for an intent first, so the deposit row
  // is never created without a provider reference to reconcile against.
  const adapters = createAdapters(supabase)
  const intent = await adapters.payments.createDepositIntent({
    idempotencyKey: randomUUID(),
    walletId: wallet.walletId,
    amount: parsed.data.amount,
    currency: wallet.currency,
    method: parsed.data.method,
  })
  if (!intent.ok) return fail('The payment provider could not be reached. Please try again.')

  const referenceCode = reference('DEP')
  const { data: deposit, error } = await supabase
    .from('deposits')
    .insert({
      transaction_id: null,
      client_id: user.id,
      wallet_id: wallet.walletId,
      method: parsed.data.method,
      provider_ref: intent.value.providerRef,
      amount: parsed.data.amount,
      currency: wallet.currency,
      status: 'pending',
      reference_code: referenceCode,
    })
    .select('id')
    .single()

  if (error || !deposit) return fail(error?.message ?? 'Could not record the deposit request.')

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'deposit.request',
    entityType: 'deposit',
    entityId: deposit.id,
    afterState: {
      status: 'pending',
      amount: parsed.data.amount,
      method: parsed.data.method,
      providerRef: intent.value.providerRef,
      referenceCode,
    },
  })

  revalidatePath('/portal/wallet')
  revalidatePath('/portal')
  return {
    ok: true,
    value: {
      depositId: deposit.id,
      providerRef: intent.value.providerRef,
      instructions: intent.value.instructions,
    },
  }
}

/**
 * Stands in for the payment provider's webhook. In a live build this would
 * be an inbound signed request (see src/lib/adapters/shared/webhook.ts);
 * here it is an explicit action so the settlement step is visible in the
 * demo rather than happening invisibly.
 *
 * Deposits at or below finance.deposit_auto_credit_limit post to the
 * ledger immediately; larger ones stop at 'confirmed' for a finance
 * operator to approve.
 */
export async function simulateProviderConfirmation(
  depositId: string,
): Promise<ActionResult<{ status: string; autoCredited: boolean }>> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { data: deposit } = await supabase
    .from('deposits')
    .select(
      'id, client_id, wallet_id, amount, currency, status, method, provider_ref, reference_code',
    )
    .eq('id', depositId)
    .single()
  if (!deposit) return fail('Deposit not found.')

  // Either the owning client or a finance operator may drive the
  // simulated confirmation; nobody else.
  const isOwner = deposit.client_id === user.id
  if (!isOwner) {
    await requirePermission(supabase, PERMISSIONS.DEPOSIT_APPROVE)
  }

  const transition = transitionDeposit(deposit.status as MoneyMovementStatus, {
    type: 'PROVIDER_CONFIRMED',
  })
  if (!transition.ok) return fail(transition.error.message)

  const serviceRole = createSupabaseServiceRoleClient()
  const adapters = createAdapters(serviceRole)

  const confirmation = await adapters.payments.confirmDepositIntent({
    idempotencyKey: randomUUID(),
    providerRef: (deposit.provider_ref as string) ?? reference('SIM'),
    amount: Number(deposit.amount),
    currency: deposit.currency as string,
  })
  if (!confirmation.ok) return fail('The provider reported a failure. Please try again.')

  await serviceRole
    .from('deposits')
    .update({ status: transition.value, confirmed_at: confirmation.value.settledAt })
    .eq('id', depositId)

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: isOwner ? 'client' : 'finance_operator',
    action: 'deposit.provider_confirmed',
    entityType: 'deposit',
    entityId: depositId,
    beforeState: { status: deposit.status },
    afterState: { status: transition.value, providerRef: confirmation.value.providerRef },
  })

  const settings = await loadFinanceSettings(serviceRole)
  const amount = fromMajorUnits(Number(deposit.amount), deposit.currency as string)

  if (requiresManualApproval(amount, settings)) {
    await notifyClient(serviceRole, {
      profileId: deposit.client_id as string,
      type: 'deposit_in_review',
      title: 'Deposit received — in review',
      body: `Your ${deposit.reference_code} deposit has been confirmed by the provider and is with our finance team for a final check.`,
      payload: { depositId },
    })
    revalidatePath('/portal/wallet')
    revalidatePath('/admin/deposits')
    return { ok: true, value: { status: transition.value, autoCredited: false } }
  }

  const credited = await creditDepositToLedger({
    serviceRole,
    depositId,
    actorId: user.id,
    actorRole: 'system',
    reason: `Auto-credited: at or below the ${settings.depositAutoCreditLimit} ${deposit.currency} auto-credit limit.`,
  })
  if (!credited.ok) return fail(credited.error)

  revalidatePath('/portal/wallet')
  revalidatePath('/portal')
  revalidatePath('/admin/deposits')
  return { ok: true, value: { status: 'approved', autoCredited: true } }
}

/**
 * The single place a deposit becomes money. Builds the posting, hands it
 * to the ledger gateway, records the transaction on the deposit row, and
 * pays any referral commission and client rebate the deposit earns.
 */
async function creditDepositToLedger(args: {
  serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>
  depositId: string
  actorId: string
  actorRole: string
  reason: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { serviceRole, depositId } = args

  const { data: deposit } = await serviceRole
    .from('deposits')
    .select('id, client_id, wallet_id, amount, currency, status, reference_code, transaction_id')
    .eq('id', depositId)
    .single()
  if (!deposit) return { ok: false, error: 'Deposit not found.' }
  if (deposit.transaction_id) return { ok: true } // already credited; idempotent

  const transition = transitionDeposit(deposit.status as MoneyMovementStatus, { type: 'APPROVE' })
  if (!transition.ok) return { ok: false, error: transition.error.message }

  const wallet = await loadWallet(
    serviceRole,
    deposit.client_id as string,
    deposit.currency as string,
  )
  if (!wallet) return { ok: false, error: 'Client wallet not found.' }

  const system = await loadSystemLedgerAccounts(serviceRole)
  const amount = fromMajorUnits(Number(deposit.amount), deposit.currency as string)

  const posting = buildDepositPosting({
    clientLedgerAccountId: wallet.ledgerAccountId,
    system,
    amount,
  })
  if (!posting.ok) return { ok: false, error: posting.error.message }

  const posted = await postTransaction(serviceRole, {
    type: 'deposit',
    posting: posting.value,
    // Derived from the deposit id, so a retried approval cannot
    // double-credit even if the status update below fails first.
    idempotencyKey: `deposit:${depositId}`,
    externalRef: deposit.reference_code as string,
  })
  if (!posted.ok) return { ok: false, error: posted.error.message }

  await serviceRole
    .from('deposits')
    .update({
      status: transition.value,
      transaction_id: posted.value,
      reviewed_by: args.actorRole === 'system' ? null : args.actorId,
      confirmed_at: new Date().toISOString(),
    })
    .eq('id', depositId)

  await writeAuditEvent(serviceRole, {
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: 'deposit.credited',
    entityType: 'deposit',
    entityId: depositId,
    reason: args.reason,
    beforeState: { status: deposit.status, transactionId: null },
    afterState: {
      status: transition.value,
      transactionId: posted.value,
      amount: Number(deposit.amount),
    },
  })

  const { data: profile } = await serviceRole
    .from('profiles')
    .select('email, first_name')
    .eq('id', deposit.client_id as string)
    .single()

  await notifyClient(serviceRole, {
    profileId: deposit.client_id as string,
    type: 'deposit_credited',
    title: 'Deposit credited',
    body: `${toMajorUnits(amount)} ${deposit.currency} has been credited to your wallet (${deposit.reference_code}). Simulated funds.`,
    payload: { depositId, transactionId: posted.value },
  })

  if (profile?.email) {
    const adapters = createAdapters(serviceRole)
    await sendTemplatedEmail(serviceRole, adapters, {
      templateKey: 'deposit_credited',
      to: profile.email as string,
      data: {
        brand: 'Aurion Markets',
        first_name: (profile.first_name as string) ?? 'there',
        amount: `${toMajorUnits(amount)} ${deposit.currency}`,
        reference: (deposit.reference_code as string) ?? depositId,
      },
    })
  }

  await awardReferralRewards(serviceRole, {
    clientId: deposit.client_id as string,
    depositId,
    amount: Number(deposit.amount),
    currency: deposit.currency as string,
  })

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Staff: decide a queued deposit
// ---------------------------------------------------------------------------

export async function decideDeposit(
  depositId: string,
  decisionInput: unknown,
): Promise<ActionResult> {
  const parsed = moneyMovementDecisionSchema.safeParse(decisionInput)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid decision.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.DEPOSIT_APPROVE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: deposit } = await supabase
    .from('deposits')
    .select('id, client_id, status, amount, currency, reference_code')
    .eq('id', depositId)
    .single()
  if (!deposit) return fail('Deposit not found.')

  const serviceRole = createSupabaseServiceRoleClient()

  if (parsed.data.decision === 'reject') {
    const transition = transitionDeposit(deposit.status as MoneyMovementStatus, {
      type: 'REJECT',
      reason: parsed.data.notes ?? '',
    })
    if (!transition.ok) return fail(transition.error.message)

    await serviceRole
      .from('deposits')
      .update({
        status: transition.value,
        reviewed_by: staff.id,
        review_notes: parsed.data.notes,
      })
      .eq('id', depositId)

    await writeAuditEvent(supabase, {
      actorId: staff.id,
      actorRole: staff.primaryRole,
      action: 'deposit.rejected',
      entityType: 'deposit',
      entityId: depositId,
      reason: parsed.data.notes,
      beforeState: { status: deposit.status },
      afterState: { status: transition.value },
    })

    await notifyClient(serviceRole, {
      profileId: deposit.client_id as string,
      type: 'deposit_rejected',
      title: 'Deposit could not be credited',
      body: `Your deposit ${deposit.reference_code} was not credited. Reason: ${parsed.data.notes}`,
      payload: { depositId },
    })

    revalidatePath('/admin/deposits')
    revalidatePath('/portal/wallet')
    return { ok: true }
  }

  const credited = await creditDepositToLedger({
    serviceRole,
    depositId,
    actorId: staff.id,
    actorRole: staff.primaryRole,
    reason: parsed.data.notes ?? 'Approved by finance after manual review.',
  })
  if (!credited.ok) return fail(credited.error)

  revalidatePath('/admin/deposits')
  revalidatePath('/admin/ledger')
  revalidatePath('/portal/wallet')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Client-initiated: request a withdrawal (reserves funds immediately)
// ---------------------------------------------------------------------------

export async function requestWithdrawal(
  input: unknown,
): Promise<ActionResult<{ withdrawalId: string; net: number; fee: number }>> {
  const parsed = withdrawalRequestSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request.')

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_status')
    .eq('id', user.id)
    .single()
  if (!profile) return fail('Profile not found.')

  const wallet = await loadWallet(supabase, user.id)
  if (!wallet) return fail('No wallet found for your account.')

  const settings = await loadFinanceSettings(supabase)
  const quote = quoteWithdrawal({
    amount: fromMajorUnits(parsed.data.amount, wallet.currency),
    availableBalance: fromMajorUnits(wallet.availableBalance, wallet.currency),
    settings,
    accountStatus: profile.account_status as string,
  })
  if (!quote.ok) return fail(quote.error.message)

  const adapters = createAdapters(supabase)
  const providerRequest = await adapters.payments.createWithdrawal({
    idempotencyKey: randomUUID(),
    walletId: wallet.walletId,
    amount: parsed.data.amount,
    currency: wallet.currency,
    method: parsed.data.method,
    payoutDetail: parsed.data.payoutDetail,
  })
  if (!providerRequest.ok) return fail('The payout provider could not be reached.')

  const referenceCode = reference('WDL')
  const { data: withdrawal, error } = await supabase
    .from('withdrawals')
    .insert({
      transaction_id: null,
      client_id: user.id,
      wallet_id: wallet.walletId,
      method: parsed.data.method,
      provider_ref: providerRequest.value.providerRef,
      amount: parsed.data.amount,
      currency: wallet.currency,
      fee: toMajorUnits(quote.value.fee),
      status: 'pending',
      requires_dual_approval: quote.value.requiresDualApproval,
      payout_detail: parsed.data.payoutDetail,
      reference_code: referenceCode,
    })
    .select('id')
    .single()

  if (error || !withdrawal) return fail(error?.message ?? 'Could not record the withdrawal.')

  // Reserve the funds now, with a real ledger posting. A rejection later
  // is a reversal (compensating entries), never a deletion — which is why
  // there is no "reserved_balance" column anywhere in this schema.
  const serviceRole = createSupabaseServiceRoleClient()
  const system = await loadSystemLedgerAccounts(serviceRole)
  const posting = buildWithdrawalReservationPosting({
    clientLedgerAccountId: wallet.ledgerAccountId,
    system,
    grossAmount: quote.value.gross,
    fee: quote.value.fee,
  })
  if (!posting.ok) {
    await serviceRole.from('withdrawals').delete().eq('id', withdrawal.id)
    return fail(posting.error.message)
  }

  const posted = await postTransaction(serviceRole, {
    type: 'withdrawal',
    posting: posting.value,
    idempotencyKey: `withdrawal-reservation:${withdrawal.id}`,
    externalRef: referenceCode,
  })
  if (!posted.ok) {
    await serviceRole.from('withdrawals').delete().eq('id', withdrawal.id)
    return fail(posted.error.message)
  }

  await serviceRole
    .from('withdrawals')
    .update({ transaction_id: posted.value })
    .eq('id', withdrawal.id)

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'withdrawal.request',
    entityType: 'withdrawal',
    entityId: withdrawal.id,
    afterState: {
      status: 'pending',
      amount: parsed.data.amount,
      fee: toMajorUnits(quote.value.fee),
      net: toMajorUnits(quote.value.net),
      method: parsed.data.method,
      requiresDualApproval: quote.value.requiresDualApproval,
      reservationTransactionId: posted.value,
      referenceCode,
    },
  })

  revalidatePath('/portal/wallet')
  revalidatePath('/admin/withdrawals')
  return {
    ok: true,
    value: {
      withdrawalId: withdrawal.id,
      net: toMajorUnits(quote.value.net),
      fee: toMajorUnits(quote.value.fee),
    },
  }
}

// ---------------------------------------------------------------------------
// Staff: approve (maker-checker) / reject / pay a withdrawal
// ---------------------------------------------------------------------------

export async function decideWithdrawal(
  withdrawalId: string,
  decisionInput: unknown,
): Promise<ActionResult<{ status: string; outstandingApprovals: number }>> {
  const parsed = moneyMovementDecisionSchema.safeParse(decisionInput)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid decision.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.WITHDRAWAL_APPROVE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: withdrawal } = await supabase
    .from('withdrawals')
    .select(
      'id, client_id, status, amount, fee, currency, reference_code, requires_dual_approval, transaction_id, method',
    )
    .eq('id', withdrawalId)
    .single()
  if (!withdrawal) return fail('Withdrawal not found.')

  const { data: approvals } = await supabase
    .from('withdrawal_approvals')
    .select('approver_id, decision')
    .eq('withdrawal_id', withdrawalId)

  const existingApprovals = (approvals ?? []).map((row) => ({
    approverId: row.approver_id as string,
    decision: row.decision as 'approve' | 'reject',
  }))

  const serviceRole = createSupabaseServiceRoleClient()

  if (parsed.data.decision === 'reject') {
    const transition = transitionWithdrawal(withdrawal.status as MoneyMovementStatus, {
      type: 'REJECT',
      reason: parsed.data.notes ?? '',
    })
    if (!transition.ok) return fail(transition.error.message)

    // Give the money back the only way this system allows: a reversal.
    let reversalId: string | null = null
    if (withdrawal.transaction_id) {
      const reversed = await reverseLedgerTransaction(serviceRole, {
        transactionId: withdrawal.transaction_id as string,
        idempotencyKey: `withdrawal-reversal:${withdrawalId}`,
      })
      if (!reversed.ok) return fail(reversed.error.message)
      reversalId = reversed.value
    }

    await supabase.from('withdrawal_approvals').insert({
      withdrawal_id: withdrawalId,
      approver_id: staff.id,
      decision: 'reject',
      notes: parsed.data.notes,
    })

    await serviceRole
      .from('withdrawals')
      .update({
        status: transition.value,
        approved_by: staff.id,
        approval_notes: parsed.data.notes,
        decided_at: new Date().toISOString(),
        reversal_transaction_id: reversalId,
      })
      .eq('id', withdrawalId)

    await writeAuditEvent(supabase, {
      actorId: staff.id,
      actorRole: staff.primaryRole,
      action: 'withdrawal.rejected',
      entityType: 'withdrawal',
      entityId: withdrawalId,
      reason: parsed.data.notes,
      beforeState: { status: withdrawal.status },
      afterState: { status: transition.value, reversalTransactionId: reversalId },
    })

    await notifyClient(serviceRole, {
      profileId: withdrawal.client_id as string,
      type: 'withdrawal_rejected',
      title: 'Withdrawal declined',
      body: `Your withdrawal ${withdrawal.reference_code} was declined and the funds have been returned to your wallet. Reason: ${parsed.data.notes}`,
      payload: { withdrawalId },
    })

    revalidatePath('/admin/withdrawals')
    revalidatePath('/portal/wallet')
    return { ok: true, value: { status: transition.value, outstandingApprovals: 0 } }
  }

  const approval = evaluateApproval({
    approverId: staff.id,
    existingApprovals,
    requiresDualApproval: Boolean(withdrawal.requires_dual_approval),
  })
  if (!approval.ok) return fail(approval.error.message)

  const { error: approvalError } = await supabase.from('withdrawal_approvals').insert({
    withdrawal_id: withdrawalId,
    approver_id: staff.id,
    decision: 'approve',
    notes: parsed.data.notes,
  })
  if (approvalError) {
    return fail(
      approvalError.code === '23505'
        ? 'You have already signed this withdrawal. A second approval must come from a different member of staff.'
        : approvalError.message,
    )
  }

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'withdrawal.approval_recorded',
    entityType: 'withdrawal',
    entityId: withdrawalId,
    reason: parsed.data.notes,
    afterState: {
      decision: 'approve',
      approvalsHeld: existingApprovals.length + 1,
      approvalsRequired: withdrawal.requires_dual_approval ? 2 : 1,
      complete: approval.value === 'complete',
    },
  })

  if (approval.value === 'awaiting_second_approval') {
    revalidatePath('/admin/withdrawals')
    return { ok: true, value: { status: withdrawal.status as string, outstandingApprovals: 1 } }
  }

  const transition = transitionWithdrawal(withdrawal.status as MoneyMovementStatus, {
    type: 'APPROVE',
  })
  if (!transition.ok) return fail(transition.error.message)

  await serviceRole
    .from('withdrawals')
    .update({
      status: transition.value,
      approved_by: staff.id,
      approval_notes: parsed.data.notes,
      decided_at: new Date().toISOString(),
    })
    .eq('id', withdrawalId)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'withdrawal.approved',
    entityType: 'withdrawal',
    entityId: withdrawalId,
    reason: parsed.data.notes,
    beforeState: { status: withdrawal.status },
    afterState: { status: transition.value },
  })

  await notifyClient(serviceRole, {
    profileId: withdrawal.client_id as string,
    type: 'withdrawal_approved',
    title: 'Withdrawal approved',
    body: `Your withdrawal ${withdrawal.reference_code} has been approved and is queued for payout.`,
    payload: { withdrawalId },
  })

  revalidatePath('/admin/withdrawals')
  revalidatePath('/portal/wallet')
  return { ok: true, value: { status: transition.value, outstandingApprovals: 0 } }
}

/** Final step: the payout leaves the house bank. */
export async function markWithdrawalPaid(withdrawalId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.WITHDRAWAL_APPROVE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: withdrawal } = await supabase
    .from('withdrawals')
    .select('id, client_id, status, amount, fee, currency, reference_code, provider_ref, method')
    .eq('id', withdrawalId)
    .single()
  if (!withdrawal) return fail('Withdrawal not found.')

  const transition = transitionWithdrawal(withdrawal.status as MoneyMovementStatus, {
    type: 'MARK_PAID',
  })
  if (!transition.ok) return fail(transition.error.message)

  const serviceRole = createSupabaseServiceRoleClient()
  const adapters = createAdapters(serviceRole)

  const net = Number(withdrawal.amount) - Number(withdrawal.fee)
  const payout = await adapters.payments.sendPayout({
    idempotencyKey: `payout:${withdrawalId}`,
    providerRef: (withdrawal.provider_ref as string) ?? reference('SIM'),
    amount: net,
    currency: withdrawal.currency as string,
    method: withdrawal.method as string,
  })
  if (!payout.ok) return fail('The payout provider reported a failure.')

  const system = await loadSystemLedgerAccounts(serviceRole)
  const posting = buildWithdrawalPayoutPosting({
    system,
    netAmount: fromMajorUnits(net, withdrawal.currency as string),
  })
  if (!posting.ok) return fail(posting.error.message)

  const posted = await postTransaction(serviceRole, {
    type: 'withdrawal',
    posting: posting.value,
    idempotencyKey: `withdrawal-payout:${withdrawalId}`,
    externalRef: withdrawal.reference_code as string,
  })
  if (!posted.ok) return fail(posted.error.message)

  await serviceRole
    .from('withdrawals')
    .update({ status: transition.value, paid_at: payout.value.paidAt })
    .eq('id', withdrawalId)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'withdrawal.paid',
    entityType: 'withdrawal',
    entityId: withdrawalId,
    beforeState: { status: withdrawal.status },
    afterState: { status: transition.value, payoutTransactionId: posted.value, net },
  })

  const { data: profile } = await serviceRole
    .from('profiles')
    .select('email, first_name')
    .eq('id', withdrawal.client_id as string)
    .single()

  await notifyClient(serviceRole, {
    profileId: withdrawal.client_id as string,
    type: 'withdrawal_paid',
    title: 'Withdrawal paid',
    body: `${net} ${withdrawal.currency} has been sent via ${withdrawalMethodLabel(withdrawal.method as string)} (${withdrawal.reference_code}). Simulated payout.`,
    payload: { withdrawalId },
  })

  if (profile?.email) {
    await sendTemplatedEmail(serviceRole, adapters, {
      templateKey: 'withdrawal_paid',
      to: profile.email as string,
      data: {
        brand: 'Aurion Markets',
        first_name: (profile.first_name as string) ?? 'there',
        amount: `${net} ${withdrawal.currency}`,
        reference: (withdrawal.reference_code as string) ?? withdrawalId,
      },
    })
  }

  revalidatePath('/admin/withdrawals')
  revalidatePath('/portal/wallet')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Client-initiated: internal transfer to another client's wallet
// ---------------------------------------------------------------------------

export async function requestInternalTransfer(input: unknown): Promise<ActionResult> {
  const parsed = internalTransferSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid request.')

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('account_status, referral_code')
    .eq('id', user.id)
    .single()
  if (!profile) return fail('Profile not found.')
  if (profile.account_status !== 'active') {
    return fail(
      `Transfers are unavailable while your account status is "${profile.account_status}".`,
    )
  }

  const fromWallet = await loadWallet(supabase, user.id)
  if (!fromWallet) return fail('No wallet found for your account.')

  const serviceRole = createSupabaseServiceRoleClient()

  // Recipients are addressed by their public client reference, so nobody
  // has to paste a uuid — and so a wrong code fails closed rather than
  // finding a stranger's wallet by fuzzy match.
  const { data: recipient } = await serviceRole
    .from('profiles')
    .select('id, first_name, last_name, account_status')
    .eq('referral_code', parsed.data.toReferralCode.trim().toUpperCase())
    .maybeSingle()

  if (!recipient) return fail('No client found with that reference. Check it and try again.')
  if (recipient.id === user.id) return fail('You cannot transfer to your own wallet.')
  if (recipient.account_status !== 'active') {
    return fail('That client cannot receive transfers at the moment.')
  }

  const toWallet = await loadWallet(serviceRole, recipient.id as string, fromWallet.currency)
  if (!toWallet) return fail('That client has no wallet in this currency.')

  const posting = buildInternalTransferPosting({
    fromLedgerAccountId: fromWallet.ledgerAccountId,
    toLedgerAccountId: toWallet.ledgerAccountId,
    amount: fromMajorUnits(parsed.data.amount, fromWallet.currency),
    availableBalance: fromMajorUnits(fromWallet.availableBalance, fromWallet.currency),
  })
  if (!posting.ok) return fail(posting.error.message)

  const transferId = randomUUID()
  const posted = await postTransaction(serviceRole, {
    type: 'internal_transfer',
    posting: posting.value,
    idempotencyKey: `internal-transfer:${transferId}`,
    externalRef: `TRF-${transferId.slice(0, 8).toUpperCase()}`,
  })
  if (!posted.ok) return fail(posted.error.message)

  await serviceRole.from('internal_transfers').insert({
    id: transferId,
    transaction_id: posted.value,
    from_wallet_id: fromWallet.walletId,
    to_wallet_id: toWallet.walletId,
    amount: parsed.data.amount,
    currency: fromWallet.currency,
    initiated_by: user.id,
    note: parsed.data.note,
  })

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'internal_transfer.created',
    entityType: 'internal_transfer',
    entityId: transferId,
    reason: parsed.data.note,
    afterState: {
      amount: parsed.data.amount,
      currency: fromWallet.currency,
      toReferralCode: parsed.data.toReferralCode,
      transactionId: posted.value,
    },
  })

  await notifyClient(serviceRole, {
    profileId: recipient.id as string,
    type: 'transfer_received',
    title: 'Transfer received',
    body: `${parsed.data.amount} ${fromWallet.currency} arrived in your wallet from ${profile.referral_code}. Simulated funds.`,
    payload: { transferId },
  })

  revalidatePath('/portal/wallet')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Staff: manual adjustment and reversal
// ---------------------------------------------------------------------------

export async function postManualAdjustment(input: unknown): Promise<ActionResult> {
  const parsed = manualAdjustmentSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid adjustment.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.LEDGER_ADJUST)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const serviceRole = createSupabaseServiceRoleClient()
  const wallet = await loadWallet(serviceRole, parsed.data.clientId)
  if (!wallet) return fail('That client has no wallet.')

  const system = await loadSystemLedgerAccounts(serviceRole)
  const amount = fromMajorUnits(parsed.data.amount, wallet.currency)

  // A debit adjustment must not push a client negative — an overdrawn
  // client wallet is a reconciliation problem, not a correction.
  if (parsed.data.direction === 'debit_client' && wallet.availableBalance < parsed.data.amount) {
    return fail(
      `That debit would overdraw the wallet (available ${wallet.availableBalance} ${wallet.currency}).`,
    )
  }

  const posting = buildManualAdjustmentPosting({
    clientLedgerAccountId: wallet.ledgerAccountId,
    system,
    amount,
    direction: parsed.data.direction,
  })
  if (!posting.ok) return fail(posting.error.message)

  const posted = await postTransaction(serviceRole, {
    type: 'adjustment',
    posting: posting.value,
    externalRef: `ADJ by ${staff.email}: ${parsed.data.reason}`,
  })
  if (!posted.ok) return fail(posted.error.message)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'ledger.manual_adjustment',
    entityType: 'transaction',
    entityId: posted.value,
    reason: parsed.data.reason,
    afterState: {
      clientId: parsed.data.clientId,
      amount: parsed.data.amount,
      direction: parsed.data.direction,
    },
  })

  await notifyClient(serviceRole, {
    profileId: parsed.data.clientId,
    type: 'wallet_adjusted',
    title: 'Wallet adjustment',
    body: `Your wallet was adjusted by our finance team: ${parsed.data.reason}`,
    payload: { transactionId: posted.value },
  })

  revalidatePath('/admin/ledger')
  revalidatePath(`/admin/clients/${parsed.data.clientId}`)
  revalidatePath('/portal/wallet')
  return { ok: true }
}

export async function reverseLedgerPosting(input: unknown): Promise<ActionResult> {
  const parsed = reverseTransactionSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid reversal.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.LEDGER_ADJUST)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const serviceRole = createSupabaseServiceRoleClient()
  const reversed = await reverseLedgerTransaction(serviceRole, {
    transactionId: parsed.data.transactionId,
  })
  if (!reversed.ok) return fail(reversed.error.message)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'ledger.reversed',
    entityType: 'transaction',
    entityId: parsed.data.transactionId,
    reason: parsed.data.reason,
    afterState: { reversalTransactionId: reversed.value },
  })

  revalidatePath('/admin/ledger')
  return { ok: true }
}

// ---------------------------------------------------------------------------
// Referral rewards, triggered by a credited deposit
// ---------------------------------------------------------------------------

/**
 * Pays the introducing broker's commission and the client's rebate off the
 * back of a credited deposit. Failures here are logged, never thrown: a
 * commission that cannot be calculated must not roll back a deposit the
 * client has already been told about.
 */
async function awardReferralRewards(
  serviceRole: ReturnType<typeof createSupabaseServiceRoleClient>,
  input: { clientId: string; depositId: string; amount: number; currency: string },
): Promise<void> {
  try {
    const { calculateDepositCommission, calculateRebate, resolveRank } =
      await import('@/domain/growth/commission')
    const { readSetting, loadSettings } = await import('@/lib/settings')
    const settings = await loadSettings(serviceRole)
    const depositAmount = fromMajorUnits(input.amount, input.currency)

    // --- Client rebate ---
    const rebateBps = readSetting(settings, 'growth.rebate_bps')
    const rebate = calculateRebate({ depositAmount, rebateBasisPoints: rebateBps })
    if (rebate.ok) {
      await serviceRole.from('rebates').insert({
        client_id: input.clientId,
        amount: toMajorUnits(rebate.value),
        currency: input.currency,
        status: 'pending',
      })
    }

    // --- Introducing broker commission ---
    const { data: referral } = await serviceRole
      .from('referral_relationships')
      .select('referrer_id, ib_id')
      .eq('referee_id', input.clientId)
      .maybeSingle()

    if (!referral?.ib_id) return

    const { data: ib } = await serviceRole
      .from('introducing_brokers')
      .select('id, profile_id, status, commission_bps, rank_id')
      .eq('id', referral.ib_id as string)
      .single()

    if (!ib || ib.status !== 'active') return

    const { data: rankRows } = await serviceRole
      .from('ranks')
      .select('id, key, name, min_referred_volume, benefits, sort_order')

    const ranks = (rankRows ?? []).map((row) => ({
      id: row.id as string,
      key: row.key as string,
      name: row.name as string,
      minReferredVolume: Number(row.min_referred_volume),
      benefits: (row.benefits ?? {}) as { commission_bps?: number },
      sortOrder: Number(row.sort_order),
    }))

    // Lifetime referred deposit volume decides the tier.
    const { data: volumeRows } = await serviceRole
      .from('deposits')
      .select('amount, client_id')
      .eq('status', 'approved')

    const { data: downline } = await serviceRole
      .from('referral_relationships')
      .select('referee_id')
      .eq('ib_id', ib.id as string)

    const downlineIds = new Set((downline ?? []).map((row) => row.referee_id as string))
    const referredVolume = (volumeRows ?? [])
      .filter((row) => downlineIds.has(row.client_id as string))
      .reduce((total, row) => total + Number(row.amount), 0)

    const commission = calculateDepositCommission({
      depositAmount,
      rule: {
        id: 'ib-rate',
        name: 'Introducing broker rate',
        basis: 'deposit_bps',
        rate: Number(ib.commission_bps),
        active: true,
      },
      rank: resolveRank(referredVolume, ranks),
    })
    if (!commission.ok) return

    await serviceRole.from('commissions').insert({
      ib_id: ib.id as string,
      source_client_id: input.clientId,
      amount: toMajorUnits(commission.value),
      currency: input.currency,
      status: 'pending',
      basis: 'deposit_bps',
    })

    await notifyClient(serviceRole, {
      profileId: ib.profile_id as string,
      type: 'commission_earned',
      title: 'Commission earned',
      body: `A referred client funded their account. ${toMajorUnits(commission.value)} ${input.currency} commission is pending approval.`,
      payload: { depositId: input.depositId },
    })
  } catch (error) {
    console.error('[finance] referral reward calculation failed:', error)
  }
}
