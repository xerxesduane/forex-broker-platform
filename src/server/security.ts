'use server'

import { revalidatePath } from 'next/cache'
import { changePasswordSchema, confirmMfaSchema, disableMfaSchema } from '@/domain/security/schema'
import { qrSvg } from '@/domain/security/qr'
import {
  buildOtpAuthUri,
  generateRecoveryCodes,
  generateTotpSecret,
  verifyTotp,
} from '@/domain/security/totp'
import { writeAuditEvent } from '@/lib/audit'
import { createSupabaseServerClient } from '@/lib/supabase/server'
import { createSupabaseServiceRoleClient } from '@/lib/supabase/service-role'

export type ActionResult<T = void> = { ok: true; value?: T } | { ok: false; error: string }

function fail(error: string): { ok: false; error: string } {
  return { ok: false, error }
}

/**
 * Begin second-factor enrolment.
 *
 * The secret is generated server-side, stored unconfirmed, and returned
 * exactly once — this response is the only time it leaves the database.
 * public.user_mfa has RLS enabled with no policies at all, so no browser
 * session can read it back, including the owner's.
 *
 * The QR code is rendered here as inline SVG rather than by a public
 * chart service: handing a client's second-factor secret to a third party
 * in a query string would undo the control it is meant to establish.
 */
export async function beginMfaEnrolment(): Promise<
  ActionResult<{ secret: string; otpauthUri: string; qrSvg: string }>
> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { data: profile } = await supabase
    .from('profiles')
    .select('two_factor_enabled, email')
    .eq('id', user.id)
    .single()

  if (profile?.two_factor_enabled) {
    return fail('Two-factor authentication is already enabled on this account.')
  }

  const secret = generateTotpSecret()
  const serviceRole = createSupabaseServiceRoleClient()

  // Upsert, so restarting enrolment replaces an abandoned secret rather
  // than failing on the primary key.
  const { error } = await serviceRole
    .from('user_mfa')
    .upsert(
      { profile_id: user.id, secret, confirmed_at: null, recovery_codes: [] },
      { onConflict: 'profile_id' },
    )
  if (error) return fail(error.message)

  const otpauthUri = buildOtpAuthUri({
    secret,
    accountName: (profile?.email as string) ?? user.email ?? 'client',
    issuer: 'Aurion Markets',
  })

  return { ok: true, value: { secret, otpauthUri, qrSvg: qrSvg(otpauthUri) } }
}

/** Prove the authenticator app works before switching the factor on. */
export async function confirmMfaEnrolment(
  input: unknown,
): Promise<ActionResult<{ recoveryCodes: string[] }>> {
  const parsed = confirmMfaSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid code.')

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const serviceRole = createSupabaseServiceRoleClient()
  const { data: mfa } = await serviceRole
    .from('user_mfa')
    .select('secret, confirmed_at')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!mfa) return fail('Start enrolment again — no pending setup was found.')

  if (!verifyTotp({ secret: mfa.secret as string, token: parsed.data.token })) {
    await serviceRole.from('login_events').insert({
      profile_id: user.id,
      email: user.email ?? '',
      kind: 'mfa_challenge',
      location_label: 'Enrolment — code rejected',
    })
    return fail('That code did not match. Check your authenticator app and try again.')
  }

  const recoveryCodes = generateRecoveryCodes()

  await serviceRole
    .from('user_mfa')
    .update({ confirmed_at: new Date().toISOString(), recovery_codes: recoveryCodes })
    .eq('profile_id', user.id)

  await serviceRole.from('profiles').update({ two_factor_enabled: true }).eq('id', user.id)

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'security.mfa_enabled',
    entityType: 'profile',
    entityId: user.id,
    afterState: { twoFactorEnabled: true, recoveryCodesIssued: recoveryCodes.length },
  })

  await serviceRole.from('login_events').insert({
    profile_id: user.id,
    email: user.email ?? '',
    kind: 'mfa_challenge',
    location_label: 'Enrolment — confirmed',
  })

  revalidatePath('/portal/security')
  return { ok: true, value: { recoveryCodes } }
}

/** Turning the factor off requires a valid code, not just a session. */
export async function disableMfa(input: unknown): Promise<ActionResult> {
  const parsed = disableMfaSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid code.')

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const serviceRole = createSupabaseServiceRoleClient()
  const { data: mfa } = await serviceRole
    .from('user_mfa')
    .select('secret')
    .eq('profile_id', user.id)
    .maybeSingle()

  if (!mfa) return fail('Two-factor authentication is not enabled on this account.')

  if (!verifyTotp({ secret: mfa.secret as string, token: parsed.data.token })) {
    return fail('That code did not match. Two-factor authentication is still on.')
  }

  await serviceRole.from('user_mfa').delete().eq('profile_id', user.id)
  await serviceRole.from('profiles').update({ two_factor_enabled: false }).eq('id', user.id)

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'security.mfa_disabled',
    entityType: 'profile',
    entityId: user.id,
    beforeState: { twoFactorEnabled: true },
    afterState: { twoFactorEnabled: false },
  })

  revalidatePath('/portal/security')
  return { ok: true }
}

/**
 * Change password. The current password is re-verified by signing in with
 * it rather than trusting the session, so a walked-up-to browser cannot
 * change the password without knowing it.
 */
export async function changePassword(input: unknown): Promise<ActionResult> {
  const parsed = changePasswordSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid password.')

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return fail('You must be signed in.')

  const { error: reauthError } = await supabase.auth.signInWithPassword({
    email: user.email,
    password: parsed.data.currentPassword,
  })
  if (reauthError) {
    const serviceRole = createSupabaseServiceRoleClient()
    await serviceRole.from('login_events').insert({
      profile_id: user.id,
      email: user.email,
      kind: 'failed_password',
      location_label: 'Password change — current password rejected',
    })
    return fail('Your current password is not correct.')
  }

  const { error } = await supabase.auth.updateUser({ password: parsed.data.newPassword })
  if (error) return fail(error.message)

  const serviceRole = createSupabaseServiceRoleClient()
  await serviceRole.from('login_events').insert({
    profile_id: user.id,
    email: user.email,
    kind: 'password_changed',
  })

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'security.password_changed',
    entityType: 'profile',
    entityId: user.id,
  })

  revalidatePath('/portal/security')
  return { ok: true }
}

/**
 * Sign every other device out. Supabase revokes the refresh tokens; the
 * login_events row is what the client actually sees on the Security page.
 */
export async function revokeOtherSessions(): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) return fail(error.message)

  const serviceRole = createSupabaseServiceRoleClient()
  await serviceRole.from('login_events').insert({
    profile_id: user.id,
    email: user.email ?? '',
    kind: 'session_revoked',
    location_label: 'All other sessions signed out',
  })

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'security.sessions_revoked',
    entityType: 'profile',
    entityId: user.id,
    reason: 'Client signed out all other devices',
  })

  revalidatePath('/portal/security')
  return { ok: true }
}

/**
 * Record a sign-in for the security timeline. Called from the auth
 * callback rather than the login form, so a sign-in through any route
 * (including a magic link) still leaves evidence.
 */
export async function recordSignIn(details: {
  profileId: string
  email: string
  userAgent?: string
  ipAddress?: string
}): Promise<void> {
  const serviceRole = createSupabaseServiceRoleClient()
  await serviceRole.from('login_events').insert({
    profile_id: details.profileId,
    email: details.email,
    kind: 'sign_in',
    user_agent: details.userAgent ?? null,
    ip_address: details.ipAddress ?? null,
  })
  await serviceRole
    .from('profiles')
    .update({ last_login_at: new Date().toISOString() })
    .eq('id', details.profileId)
}
