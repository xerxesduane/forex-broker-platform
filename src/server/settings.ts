'use server'

import { revalidatePath } from 'next/cache'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import {
  isSettingKey,
  parseSettingValue,
  updateEmailTemplateSchema,
  updateSettingSchema,
} from '@/domain/settings/schema'
import { writeAuditEvent } from '@/lib/audit'
import { getActingStaff } from '@/lib/auth/current-user'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type ActionResult<T = void> = { ok: true; value?: T } | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/**
 * Update one platform setting.
 *
 * The raw form value is parsed against that key's own schema before it is
 * written, so a typo in the dual-approval threshold is a validation error
 * here rather than a broken finance rule later. Every change is audited
 * with the before and after value, because these settings change how money
 * moves.
 */
export async function updatePlatformSetting(input: unknown): Promise<ActionResult> {
  const parsed = updateSettingSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid setting.')
  if (!isSettingKey(parsed.data.key)) return fail('Unknown setting.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.SETTINGS_MANAGE)

  const actor = await getActingStaff(supabase)
  if (!actor) return fail('Staff session not found.')

  const value = parseSettingValue(parsed.data.key, parsed.data.value)
  if (!value.ok) return fail(value.error)

  const { data: existing } = await supabase
    .from('platform_settings')
    .select('key, value, label')
    .eq('key', parsed.data.key)
    .single()
  if (!existing) return fail('That setting does not exist.')

  const { error } = await supabase
    .from('platform_settings')
    .update({ value: value.value, updated_by: actor.id })
    .eq('key', parsed.data.key)
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: actor.id,
    actorRole: actor.primaryRole,
    action: 'settings.updated',
    entityType: 'platform_setting',
    // platform_settings is keyed by text, but audit_events.entity_id is a
    // uuid column, so the key travels in the state payload instead of
    // being crammed into an id it does not fit.
    entityId: '00000000-0000-0000-0000-000000000000',
    reason: `Changed "${existing.label}"`,
    beforeState: { key: existing.key, value: existing.value },
    afterState: { key: parsed.data.key, value: value.value },
  })

  revalidatePath('/admin/settings')
  return { ok: true }
}

export async function updateEmailTemplate(input: unknown): Promise<ActionResult> {
  const parsed = updateEmailTemplateSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid template.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.SETTINGS_MANAGE)

  const actor = await getActingStaff(supabase)
  if (!actor) return fail('Staff session not found.')

  const { data: existing } = await supabase
    .from('email_templates')
    .select('key, name, subject, body')
    .eq('key', parsed.data.key)
    .single()
  if (!existing) return fail('That template does not exist.')

  const { error } = await supabase
    .from('email_templates')
    .update({
      subject: parsed.data.subject,
      body: parsed.data.body,
      updated_by: actor.id,
    })
    .eq('key', parsed.data.key)
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: actor.id,
    actorRole: actor.primaryRole,
    action: 'email_template.updated',
    entityType: 'email_template',
    entityId: '00000000-0000-0000-0000-000000000000',
    reason: `Edited "${existing.name}"`,
    beforeState: { key: existing.key, subject: existing.subject },
    afterState: { key: parsed.data.key, subject: parsed.data.subject },
  })

  revalidatePath('/admin/settings')
  return { ok: true }
}
