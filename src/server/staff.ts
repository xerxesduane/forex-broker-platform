'use server'

import { revalidatePath } from 'next/cache'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import {
  assignRoleSchema,
  inviteStaffSchema,
  revokeRoleSchema,
  toggleRolePermissionSchema,
} from '@/domain/staff/schema'
import { writeAuditEvent } from '@/lib/audit'
import { getActingStaff } from '@/lib/auth/current-user'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'

export type ActionResult<T = void> = { ok: true; value?: T } | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/**
 * Create a staff account and assign its first role.
 *
 * Uses the Auth admin API (service role) because a staff account is
 * created *for* someone rather than by them. A temporary password is
 * returned once, to the inviting administrator, and never stored in a
 * readable form — Supabase hashes it like any other.
 */
export async function inviteStaff(
  input: unknown,
): Promise<ActionResult<{ profileId: string; temporaryPassword: string }>> {
  const parsed = inviteStaffSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid invitation.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.STAFF_MANAGE)

  const actor = await getActingStaff(supabase)
  if (!actor) return fail('Staff session not found.')

  const serviceRole = createSupabaseServiceRoleClient()

  const { data: role } = await serviceRole
    .from('roles')
    .select('id, key, name')
    .eq('key', parsed.data.roleKey)
    .single()
  if (!role) return fail('That role does not exist.')

  // Demo environment: a readable temporary password is shown once so the
  // account can actually be demonstrated. A production build would send an
  // invite link and never mint a password at all.
  const temporaryPassword = `Aurion-${Math.random().toString(36).slice(2, 8)}-${new Date().getFullYear()}!`

  const { data: created, error: createError } = await serviceRole.auth.admin.createUser({
    email: parsed.data.email,
    password: temporaryPassword,
    email_confirm: true,
  })

  if (createError || !created.user) {
    return fail(
      createError?.message.includes('already been registered')
        ? 'An account with that email already exists.'
        : (createError?.message ?? 'Could not create the staff account.'),
    )
  }

  const profileId = created.user.id

  await serviceRole
    .from('profiles')
    .update({
      account_kind: 'staff',
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
    })
    .eq('id', profileId)

  const { error: assignError } = await serviceRole.from('staff_role_assignments').insert({
    profile_id: profileId,
    role_id: role.id,
    assigned_by: actor.id,
  })
  if (assignError) return fail(assignError.message)

  await writeAuditEvent(supabase, {
    actorId: actor.id,
    actorRole: actor.primaryRole,
    action: 'staff.invited',
    entityType: 'profile',
    entityId: profileId,
    reason: `Invited as ${role.name}`,
    afterState: {
      email: parsed.data.email,
      roleKey: parsed.data.roleKey,
      accountKind: 'staff',
    },
  })

  revalidatePath('/admin/staff')
  return { ok: true, value: { profileId, temporaryPassword } }
}

export async function assignStaffRole(input: unknown): Promise<ActionResult> {
  const parsed = assignRoleSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid assignment.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.STAFF_MANAGE)

  const actor = await getActingStaff(supabase)
  if (!actor) return fail('Staff session not found.')

  const { data: role } = await supabase
    .from('roles')
    .select('id, key, name')
    .eq('key', parsed.data.roleKey)
    .single()
  if (!role) return fail('That role does not exist.')

  const { error } = await supabase.from('staff_role_assignments').insert({
    profile_id: parsed.data.profileId,
    role_id: role.id,
    assigned_by: actor.id,
  })

  if (error) {
    return fail(
      error.code === '23505' ? 'That member of staff already holds this role.' : error.message,
    )
  }

  await writeAuditEvent(supabase, {
    actorId: actor.id,
    actorRole: actor.primaryRole,
    action: 'staff.role_assigned',
    entityType: 'profile',
    entityId: parsed.data.profileId,
    afterState: { roleKey: parsed.data.roleKey, roleName: role.name },
  })

  revalidatePath('/admin/staff')
  return { ok: true }
}

export async function revokeStaffRole(input: unknown): Promise<ActionResult> {
  const parsed = revokeRoleSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid revocation.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.STAFF_MANAGE)

  const actor = await getActingStaff(supabase)
  if (!actor) return fail('Staff session not found.')

  const { data: role } = await supabase
    .from('roles')
    .select('id, key, name')
    .eq('key', parsed.data.roleKey)
    .single()
  if (!role) return fail('That role does not exist.')

  // Guard against locking the platform out of its own administration:
  // never remove the last super_admin, and never let someone strip their
  // own super_admin in a single click.
  if (parsed.data.roleKey === 'super_admin') {
    const { count } = await supabase
      .from('staff_role_assignments')
      .select('*', { count: 'exact', head: true })
      .eq('role_id', role.id)

    if ((count ?? 0) <= 1) {
      return fail(
        'This is the last Super Administrator. Assign the role to someone else before revoking it.',
      )
    }
    if (parsed.data.profileId === actor.id) {
      return fail('Ask another administrator to revoke your own Super Administrator role.')
    }
  }

  const { error } = await supabase
    .from('staff_role_assignments')
    .delete()
    .eq('profile_id', parsed.data.profileId)
    .eq('role_id', role.id)
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: actor.id,
    actorRole: actor.primaryRole,
    action: 'staff.role_revoked',
    entityType: 'profile',
    entityId: parsed.data.profileId,
    reason: parsed.data.reason,
    beforeState: { roleKey: parsed.data.roleKey },
    afterState: { roleKey: null },
  })

  revalidatePath('/admin/staff')
  return { ok: true }
}

/**
 * Grant or revoke one atomic permission on one role — the role/permission
 * matrix editor. Requires role.manage, which is deliberately a different
 * permission from staff.manage: deciding what a role *can do* is a bigger
 * act than deciding who holds it.
 */
export async function toggleRolePermission(input: unknown): Promise<ActionResult> {
  const parsed = toggleRolePermissionSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid change.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.ROLE_MANAGE)

  const actor = await getActingStaff(supabase)
  if (!actor) return fail('Staff session not found.')

  const [{ data: role }, { data: permission }] = await Promise.all([
    supabase.from('roles').select('id, key, name').eq('key', parsed.data.roleKey).single(),
    supabase.from('permissions').select('id, key').eq('key', parsed.data.permissionKey).single(),
  ])

  if (!role) return fail('That role does not exist.')
  if (!permission) return fail('That permission does not exist.')

  // The Super Administrator role is the platform's escape hatch. Letting
  // it be whittled down permission by permission is how an admin console
  // becomes unrecoverable.
  if (parsed.data.roleKey === 'super_admin' && !parsed.data.grant) {
    return fail('Super Administrator keeps every permission by design — it cannot be reduced.')
  }

  if (parsed.data.grant) {
    const { error } = await supabase
      .from('role_permissions')
      .insert({ role_id: role.id, permission_id: permission.id })
    if (error && error.code !== '23505') return fail(error.message)
  } else {
    const { error } = await supabase
      .from('role_permissions')
      .delete()
      .eq('role_id', role.id)
      .eq('permission_id', permission.id)
    if (error) return fail(error.message)
  }

  await writeAuditEvent(supabase, {
    actorId: actor.id,
    actorRole: actor.primaryRole,
    action: parsed.data.grant ? 'role.permission_granted' : 'role.permission_revoked',
    entityType: 'role',
    entityId: role.id,
    afterState: {
      roleKey: parsed.data.roleKey,
      permissionKey: parsed.data.permissionKey,
      granted: parsed.data.grant,
    },
  })

  revalidatePath('/admin/staff')
  return { ok: true }
}
