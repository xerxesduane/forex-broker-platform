'use server'

import { randomUUID } from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { demoAccountRequestSchema } from '@/domain/trading-account/schema'
import { transitionTradingAccountStatus } from '@/domain/trading-account/state-machine'
import { createAdapters } from '@/lib/adapters'
import { writeAuditEvent } from '@/lib/audit'
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
