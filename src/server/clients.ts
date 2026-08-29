'use server'

import { revalidatePath } from 'next/cache'
import { clientNoteSchema, clientRiskSchema, clientStatusSchema } from '@/domain/client/schema'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { writeAuditEvent } from '@/lib/audit'
import { getActingStaff } from '@/lib/auth/current-user'
import { notifyClient } from '@/lib/notify'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'

export type ActionResult<T = void> = { ok: true; value?: T } | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/**
 * Restrict, suspend, close or reinstate a client account.
 *
 * This is the switch the finance domain reads before allowing a deposit,
 * withdrawal or transfer (see checkDepositEligibility / quoteWithdrawal),
 * so it is a real control rather than a label — which is exactly why the
 * reason is mandatory and audited.
 */
export async function setClientAccountStatus(input: unknown): Promise<ActionResult> {
  const parsed = clientStatusSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid change.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.CLIENT_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: client } = await supabase
    .from('profiles')
    .select('id, account_kind, account_status, email')
    .eq('id', parsed.data.clientId)
    .single()
  if (!client) return fail('Client not found.')
  if (client.account_kind !== 'client') {
    return fail('Account status applies to client accounts only.')
  }

  const { error } = await supabase
    .from('profiles')
    .update({ account_status: parsed.data.accountStatus })
    .eq('id', parsed.data.clientId)
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'client.status_changed',
    entityType: 'profile',
    entityId: parsed.data.clientId,
    reason: parsed.data.reason,
    beforeState: { accountStatus: client.account_status },
    afterState: { accountStatus: parsed.data.accountStatus },
  })

  const serviceRole = createSupabaseServiceRoleClient()
  await notifyClient(serviceRole, {
    profileId: parsed.data.clientId,
    type: 'account_status_changed',
    title:
      parsed.data.accountStatus === 'active'
        ? 'Account reinstated'
        : `Account ${parsed.data.accountStatus}`,
    body:
      parsed.data.accountStatus === 'active'
        ? 'Your account is active again and funding is available.'
        : `Your account is ${parsed.data.accountStatus}. ${parsed.data.reason}`,
    payload: { accountStatus: parsed.data.accountStatus },
  })

  revalidatePath('/admin/clients')
  revalidatePath(`/admin/clients/${parsed.data.clientId}`)
  return { ok: true }
}

export async function setClientRiskRating(input: unknown): Promise<ActionResult> {
  const parsed = clientRiskSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid change.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.CLIENT_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: client } = await supabase
    .from('profiles')
    .select('id, risk_rating')
    .eq('id', parsed.data.clientId)
    .single()
  if (!client) return fail('Client not found.')

  const { error } = await supabase
    .from('profiles')
    .update({ risk_rating: parsed.data.riskRating })
    .eq('id', parsed.data.clientId)
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'client.risk_rating_changed',
    entityType: 'profile',
    entityId: parsed.data.clientId,
    reason: parsed.data.reason,
    beforeState: { riskRating: client.risk_rating },
    afterState: { riskRating: parsed.data.riskRating },
  })

  revalidatePath(`/admin/clients/${parsed.data.clientId}`)
  return { ok: true }
}

/** An internal note. Clients never see these — there is no read policy. */
export async function addClientNote(input: unknown): Promise<ActionResult> {
  const parsed = clientNoteSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid note.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.CLIENT_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { error } = await supabase.from('client_notes').insert({
    client_id: parsed.data.clientId,
    author_id: staff.id,
    author_role: staff.primaryRole,
    body: parsed.data.body,
    pinned: parsed.data.pinned ?? false,
  })
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'client.note_added',
    entityType: 'profile',
    entityId: parsed.data.clientId,
    afterState: { pinned: parsed.data.pinned ?? false, length: parsed.data.body.length },
  })

  revalidatePath(`/admin/clients/${parsed.data.clientId}`)
  return { ok: true }
}
