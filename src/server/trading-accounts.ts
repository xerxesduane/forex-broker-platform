'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import {
  accountLifecycleSchema,
  accountProvisioningDecisionSchema,
  demoAccountRequestSchema,
  realAccountRequestSchema,
} from '@/domain/trading-account/schema'
import { transitionTradingAccountStatus } from '@/domain/trading-account/state-machine'
import { accountPlan } from '@/domain/trading-account/types'
import { createAdapters } from '@/lib/adapters'
import { writeAuditEvent } from '@/lib/audit'
import { getActingStaff } from '@/lib/auth/current-user'
import { notifyClient, sendTemplatedEmail } from '@/lib/notify'
import { requirePermission } from '@/lib/rbac/require-permission'
import { loadSettings, readSetting } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'

export type RequestDemoAccountResult =
  { ok: true; tradingAccountId: string } | { ok: false; error: string }

/**
 * Demo accounts auto-provision synchronously (no ops approval step) —
 * see docs/assumptions.md. The request row is inserted under the user's
 * own session (RLS: client may insert only their own 'requested' row);
 * the provisioning transitions that follow are a trusted server action
 * and use the service-role client, per the note on
 * supabase/migrations/00000000000005_trading_accounts.sql.
 */
export async function requestDemoAccount(input: unknown): Promise<RequestDemoAccountResult> {
  const parsed = demoAccountRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('kyc_status')
    .eq('id', user.id)
    .single()

  if (profile?.kyc_status !== 'approved') {
    return {
      ok: false,
      error: 'Your KYC application must be approved before requesting an account.',
    }
  }

  const { data: account, error: insertError } = await supabase
    .from('trading_accounts')
    .insert({
      client_id: user.id,
      account_type: 'demo',
      base_currency: parsed.data.baseCurrency,
      leverage: parsed.data.leverage,
    })
    .select('id, status')
    .single()

  if (insertError || !account) {
    return { ok: false, error: insertError?.message ?? 'Could not create the account request.' }
  }

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'trading_account.request',
    entityType: 'trading_account',
    entityId: account.id,
    afterState: {
      status: 'requested',
      accountType: 'demo',
      baseCurrency: parsed.data.baseCurrency,
      leverage: parsed.data.leverage,
    },
  })

  const serviceRoleClient = createSupabaseServiceRoleClient()
  const adapters = createAdapters(serviceRoleClient)

  const startProvisioning = transitionTradingAccountStatus(account.status, {
    type: 'START_PROVISIONING',
  })
  if (!startProvisioning.ok) {
    return { ok: false, error: startProvisioning.error.message }
  }

  await serviceRoleClient
    .from('trading_accounts')
    .update({ status: startProvisioning.value })
    .eq('id', account.id)

  const provisionResult = await adapters.mt5.provisionDemoAccount({
    idempotencyKey: randomUUID(),
    clientId: user.id,
    baseCurrency: parsed.data.baseCurrency,
    leverage: parsed.data.leverage,
  })

  if (!provisionResult.ok) {
    const failed = transitionTradingAccountStatus(startProvisioning.value, {
      type: 'PROVISION_FAILED',
      reason: provisionResult.error.message,
    })
    if (failed.ok) {
      await serviceRoleClient
        .from('trading_accounts')
        .update({ status: failed.value, rejection_reason: provisionResult.error.message })
        .eq('id', account.id)
    }
    await writeAuditEvent(serviceRoleClient, {
      actorId: user.id,
      actorRole: 'system',
      action: 'trading_account.provision_failed',
      entityType: 'trading_account',
      entityId: account.id,
      reason: provisionResult.error.message,
    })
    return { ok: false, error: 'Demo account provisioning failed. Please try again.' }
  }

  const activated = transitionTradingAccountStatus(startProvisioning.value, {
    type: 'PROVISION_SUCCEEDED',
  })
  if (!activated.ok) {
    return { ok: false, error: activated.error.message }
  }

  const { mt5Login, mt5Server, mt5Group, startingBalance, provisionedAt } = provisionResult.value

  await serviceRoleClient
    .from('trading_accounts')
    .update({
      status: activated.value,
      mt5_login: mt5Login,
      mt5_server: mt5Server,
      mt5_group: mt5Group,
      balance: startingBalance,
      equity: startingBalance,
      free_margin: startingBalance,
      provisioned_at: provisionedAt,
      snapshot_synced_at: provisionedAt,
    })
    .eq('id', account.id)

  await writeAuditEvent(serviceRoleClient, {
    actorId: user.id,
    actorRole: 'system',
    action: 'trading_account.provisioned',
    entityType: 'trading_account',
    entityId: account.id,
    beforeState: { status: 'provisioning' },
    afterState: { status: 'active', mt5Login, mt5Server, mt5Group },
  })

  await serviceRoleClient.from('notifications').insert({
    profile_id: user.id,
    type: 'trading_account_provisioned',
    title: 'Demo account ready',
    body: `Your demo MT5 account ${mt5Login} is ready to use.`,
    payload: { tradingAccountId: account.id, mt5Login },
  })

  revalidatePath('/portal/accounts')
  revalidatePath('/portal')
  return { ok: true, tradingAccountId: account.id }
}

// ---------------------------------------------------------------------------
// Real accounts
//
// Unlike a demo account these do not auto-provision: when
// trading.real_accounts_require_approval is on (the default), the request
// queues for trading operations, which is how a live broker behaves. The
// setting is honoured rather than hardcoded, so the demo can flip it and
// show the difference.
// ---------------------------------------------------------------------------

export async function requestRealAccount(
  input: unknown,
): Promise<{ ok: true; tradingAccountId: string; queued: boolean } | { ok: false; error: string }> {
  const parsed = realAccountRequestSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid request.' }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const { data: profile } = await supabase
    .from('profiles')
    .select('kyc_status, account_status')
    .eq('id', user.id)
    .single()

  if (profile?.kyc_status !== 'approved') {
    return {
      ok: false,
      error: 'Your identity verification must be approved before opening a real account.',
    }
  }
  if (profile.account_status !== 'active') {
    return {
      ok: false,
      error: `New accounts are unavailable while your account status is "${profile.account_status}".`,
    }
  }

  const plan = accountPlan(parsed.data.plan)
  if (parsed.data.leverage > plan.maxLeverage) {
    return {
      ok: false,
      error: `The ${plan.name} plan is capped at 1:${plan.maxLeverage} leverage.`,
    }
  }

  const { data: account, error: insertError } = await supabase
    .from('trading_accounts')
    .insert({
      client_id: user.id,
      account_type: 'real',
      base_currency: parsed.data.baseCurrency,
      leverage: parsed.data.leverage,
      spread_model: plan.spreadModel,
      commission_model: plan.commissionModel,
      nickname: parsed.data.nickname ?? null,
      status: 'requested',
    })
    .select('id, status')
    .single()

  if (insertError || !account) {
    return { ok: false, error: insertError?.message ?? 'Could not create the account request.' }
  }

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'trading_account.request',
    entityType: 'trading_account',
    entityId: account.id,
    afterState: {
      status: 'requested',
      accountType: 'real',
      plan: plan.key,
      baseCurrency: parsed.data.baseCurrency,
      leverage: parsed.data.leverage,
    },
  })

  const serviceRoleClient = createSupabaseServiceRoleClient()
  const settings = await loadSettings(serviceRoleClient)
  const requiresApproval = readSetting(settings, 'trading.real_accounts_require_approval')

  if (requiresApproval) {
    revalidatePath('/portal/accounts')
    revalidatePath('/admin/trading-accounts')
    return { ok: true, tradingAccountId: account.id, queued: true }
  }

  const provisioned = await provisionAccountViaAdapter({
    serviceRoleClient,
    tradingAccountId: account.id,
    clientId: user.id,
    actorId: user.id,
    actorRole: 'system',
    accountType: 'real',
    plan: plan.key,
    baseCurrency: parsed.data.baseCurrency,
    leverage: parsed.data.leverage,
  })
  if (!provisioned.ok) return { ok: false, error: provisioned.error }

  revalidatePath('/portal/accounts')
  revalidatePath('/admin/trading-accounts')
  return { ok: true, tradingAccountId: account.id, queued: false }
}

/**
 * Drive an account request through the MT5 adapter and record the result.
 * Shared by the demo path, the (optional) instant real path, and the
 * trading-operations approval path so all three produce identical
 * evidence.
 */
async function provisionAccountViaAdapter(args: {
  serviceRoleClient: ReturnType<typeof createSupabaseServiceRoleClient>
  tradingAccountId: string
  clientId: string
  actorId: string
  actorRole: string
  accountType: 'demo' | 'real'
  plan: string
  baseCurrency: string
  leverage: number
  approvedBy?: string
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const { serviceRoleClient, tradingAccountId } = args
  const adapters = createAdapters(serviceRoleClient)

  const { data: current } = await serviceRoleClient
    .from('trading_accounts')
    .select('status')
    .eq('id', tradingAccountId)
    .single()
  if (!current) return { ok: false, error: 'Trading account not found.' }

  const startProvisioning = transitionTradingAccountStatus(current.status as never, {
    type: 'START_PROVISIONING',
  })
  if (!startProvisioning.ok) return { ok: false, error: startProvisioning.error.message }

  await serviceRoleClient
    .from('trading_accounts')
    .update({ status: startProvisioning.value })
    .eq('id', tradingAccountId)

  const request = {
    idempotencyKey: `provision:${tradingAccountId}`,
    clientId: args.clientId,
    baseCurrency: args.baseCurrency,
    leverage: args.leverage,
  }

  const provisionResult =
    args.accountType === 'demo'
      ? await adapters.mt5.provisionDemoAccount(request)
      : await adapters.mt5.provisionRealAccount({ ...request, plan: args.plan })

  if (!provisionResult.ok) {
    const failed = transitionTradingAccountStatus(startProvisioning.value, {
      type: 'PROVISION_FAILED',
      reason: provisionResult.error.message,
    })
    if (failed.ok) {
      await serviceRoleClient
        .from('trading_accounts')
        .update({ status: failed.value, rejection_reason: provisionResult.error.message })
        .eq('id', tradingAccountId)
    }
    await writeAuditEvent(serviceRoleClient, {
      actorId: args.actorId,
      actorRole: 'system',
      action: 'trading_account.provision_failed',
      entityType: 'trading_account',
      entityId: tradingAccountId,
      reason: provisionResult.error.message,
    })
    return { ok: false, error: 'Account provisioning failed. Please try again.' }
  }

  const activated = transitionTradingAccountStatus(startProvisioning.value, {
    type: 'PROVISION_SUCCEEDED',
  })
  if (!activated.ok) return { ok: false, error: activated.error.message }

  const { mt5Login, mt5Server, mt5Group, startingBalance, provisionedAt } = provisionResult.value

  await serviceRoleClient
    .from('trading_accounts')
    .update({
      status: activated.value,
      mt5_login: mt5Login,
      mt5_server: mt5Server,
      mt5_group: mt5Group,
      balance: startingBalance,
      equity: startingBalance,
      free_margin: startingBalance,
      provisioned_at: provisionedAt,
      snapshot_synced_at: provisionedAt,
      approved_by: args.approvedBy ?? null,
    })
    .eq('id', tradingAccountId)

  await writeAuditEvent(serviceRoleClient, {
    actorId: args.actorId,
    actorRole: args.actorRole,
    action: 'trading_account.provisioned',
    entityType: 'trading_account',
    entityId: tradingAccountId,
    beforeState: { status: 'provisioning' },
    afterState: { status: activated.value, mt5Login, mt5Server, mt5Group },
  })

  const { data: profile } = await serviceRoleClient
    .from('profiles')
    .select('email, first_name')
    .eq('id', args.clientId)
    .single()

  await notifyClient(serviceRoleClient, {
    profileId: args.clientId,
    type: 'trading_account_provisioned',
    title: `${args.accountType === 'demo' ? 'Demo' : 'Live'} account ready`,
    body: `Your ${args.accountType} MT5 account ${mt5Login} on ${mt5Server} is ready to use. Simulated account.`,
    payload: { tradingAccountId, mt5Login },
  })

  if (profile?.email) {
    await sendTemplatedEmail(serviceRoleClient, adapters, {
      templateKey: 'account_provisioned',
      to: profile.email as string,
      data: {
        brand: 'Aurion Markets',
        first_name: (profile.first_name as string) ?? 'there',
        account_type: args.accountType,
        mt5_login: String(mt5Login),
        mt5_server: mt5Server,
      },
    })
  }

  return { ok: true }
}

// ---------------------------------------------------------------------------
// Trading operations: decide a queued request, manage the lifecycle, sync
// ---------------------------------------------------------------------------

export async function decideAccountProvisioning(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = accountProvisioningDecisionSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid decision.' }
  }

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.TRADING_ACCOUNT_PROVISION)

  const staff = await getActingStaff(supabase)
  if (!staff) return { ok: false, error: 'Staff session not found.' }

  const { data: account } = await supabase
    .from('trading_accounts')
    .select('id, client_id, account_type, status, base_currency, leverage, spread_model')
    .eq('id', parsed.data.tradingAccountId)
    .single()
  if (!account) return { ok: false, error: 'Trading account not found.' }

  const serviceRoleClient = createSupabaseServiceRoleClient()

  if (parsed.data.decision === 'reject') {
    const transition = transitionTradingAccountStatus(account.status as never, {
      type: 'REJECT_REQUEST',
      reason: parsed.data.reason,
    })
    if (!transition.ok) return { ok: false, error: transition.error.message }

    await supabase
      .from('trading_accounts')
      .update({ status: transition.value, rejection_reason: parsed.data.reason })
      .eq('id', account.id)

    await writeAuditEvent(supabase, {
      actorId: staff.id,
      actorRole: staff.primaryRole,
      action: 'trading_account.request_rejected',
      entityType: 'trading_account',
      entityId: account.id,
      reason: parsed.data.reason,
      beforeState: { status: account.status },
      afterState: { status: transition.value },
    })

    await notifyClient(serviceRoleClient, {
      profileId: account.client_id as string,
      type: 'trading_account_rejected',
      title: 'Account request declined',
      body: `Your ${account.account_type} account request was declined. Reason: ${parsed.data.reason}`,
      payload: { tradingAccountId: account.id },
    })

    revalidatePath('/admin/trading-accounts')
    revalidatePath('/portal/accounts')
    return { ok: true }
  }

  const provisioned = await provisionAccountViaAdapter({
    serviceRoleClient,
    tradingAccountId: account.id,
    clientId: account.client_id as string,
    actorId: staff.id,
    actorRole: staff.primaryRole,
    accountType: account.account_type as 'demo' | 'real',
    plan: account.spread_model === 'raw_plus_commission' ? 'raw' : 'standard',
    baseCurrency: account.base_currency as string,
    leverage: Number(account.leverage),
    approvedBy: staff.id,
  })
  if (!provisioned.ok) return { ok: false, error: provisioned.error }

  revalidatePath('/admin/trading-accounts')
  revalidatePath('/portal/accounts')
  return { ok: true }
}

export async function changeAccountLifecycle(
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const parsed = accountLifecycleSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid change.' }
  }

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.TRADING_ACCOUNT_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return { ok: false, error: 'Staff session not found.' }

  const { data: account } = await supabase
    .from('trading_accounts')
    .select('id, client_id, status, mt5_login, account_type')
    .eq('id', parsed.data.tradingAccountId)
    .single()
  if (!account) return { ok: false, error: 'Trading account not found.' }

  const event =
    parsed.data.action === 'suspend'
      ? ({ type: 'SUSPEND', reason: parsed.data.reason } as const)
      : parsed.data.action === 'reactivate'
        ? ({ type: 'REACTIVATE' } as const)
        : ({ type: 'CLOSE', reason: parsed.data.reason } as const)

  const transition = transitionTradingAccountStatus(account.status as never, event)
  if (!transition.ok) return { ok: false, error: transition.error.message }

  const serviceRoleClient = createSupabaseServiceRoleClient()
  const adapters = createAdapters(serviceRoleClient)

  // Mirror the change onto the (simulated) MT5 login, so the platform and
  // the trading server cannot silently disagree about whether a client can
  // trade.
  if (account.mt5_login) {
    await adapters.mt5.setAccountState({
      idempotencyKey: `account-state:${account.id}:${parsed.data.action}:${Date.now()}`,
      mt5Login: Number(account.mt5_login),
      state:
        parsed.data.action === 'reactivate'
          ? 'enabled'
          : parsed.data.action === 'suspend'
            ? 'trade_disabled'
            : 'disabled',
      reason: parsed.data.reason,
    })
  }

  await supabase
    .from('trading_accounts')
    .update({
      status: transition.value,
      suspension_reason: parsed.data.action === 'reactivate' ? null : parsed.data.reason,
    })
    .eq('id', account.id)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: `trading_account.${parsed.data.action}`,
    entityType: 'trading_account',
    entityId: account.id,
    reason: parsed.data.reason,
    beforeState: { status: account.status },
    afterState: { status: transition.value },
  })

  await notifyClient(serviceRoleClient, {
    profileId: account.client_id as string,
    type: 'trading_account_status_changed',
    title: `Trading account ${transition.value}`,
    body: `Your ${account.account_type} account is now ${transition.value}. ${parsed.data.reason}`,
    payload: { tradingAccountId: account.id },
  })

  revalidatePath('/admin/trading-accounts')
  revalidatePath('/portal/accounts')
  return { ok: true }
}

/**
 * Refresh the MT5 snapshot. Writes only the snapshot columns — this is the
 * one place they change, and it is explicitly not a money movement: the
 * ledger is untouched (ADR 0003).
 */
export async function syncAccountSnapshot(
  tradingAccountId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const { data: account } = await supabase
    .from('trading_accounts')
    .select('id, client_id, mt5_login, status, balance')
    .eq('id', tradingAccountId)
    .single()
  if (!account) return { ok: false, error: 'Trading account not found.' }

  // The owning client may refresh their own; anyone else needs the
  // trading-account permission.
  if (account.client_id !== user.id) {
    await requirePermission(supabase, PERMISSIONS.TRADING_ACCOUNT_VIEW)
  }

  if (!account.mt5_login || account.status !== 'active') {
    return { ok: false, error: 'This account is not active on the trading server yet.' }
  }

  const serviceRoleClient = createSupabaseServiceRoleClient()
  const adapters = createAdapters(serviceRoleClient)

  const snapshot = await adapters.mt5.getAccountSnapshot(
    Number(account.mt5_login),
    Number(account.balance),
  )
  if (!snapshot.ok) return { ok: false, error: 'Could not reach the trading server.' }

  await serviceRoleClient
    .from('trading_accounts')
    .update({
      balance: snapshot.value.balance,
      equity: snapshot.value.equity,
      credit: snapshot.value.credit,
      used_margin: snapshot.value.usedMargin,
      free_margin: snapshot.value.freeMargin,
      margin_level: snapshot.value.marginLevel,
      snapshot_synced_at: snapshot.value.syncedAt,
    })
    .eq('id', tradingAccountId)

  revalidatePath('/portal/accounts')
  revalidatePath(`/portal/accounts/${tradingAccountId}`)
  revalidatePath('/admin/trading-accounts')
  return { ok: true }
}
