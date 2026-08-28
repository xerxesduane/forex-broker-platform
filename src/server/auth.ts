'use server'

import { registerSchema, loginSchema } from '@/domain/auth/schema'
import { writeAuditEvent } from '@/lib/audit'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const SITE_URL = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'

export type RegisterResult = { ok: true } | { ok: false; error: string }

export async function registerClient(input: unknown): Promise<RegisterResult> {
  const parsed = registerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid registration.' }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: { emailRedirectTo: `${SITE_URL}/auth/callback?next=/portal` },
  })

  if (error) return { ok: false, error: error.message }
  if (!data.user) return { ok: false, error: 'Registration did not return a user.' }

  await writeAuditEvent(supabase, {
    actorId: data.user.id,
    actorRole: 'client',
    action: 'auth.register',
    entityType: 'profile',
    entityId: data.user.id,
    afterState: { email: parsed.data.email },
  })

  return { ok: true }
}

export type LoginResult = { ok: true } | { ok: false; error: string }

export async function loginClient(input: unknown): Promise<LoginResult> {
  const parsed = loginSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Invalid login.' }
  }

  const supabase = await createSupabaseServerClient()
  const { data, error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  })

  if (error) return { ok: false, error: 'Incorrect email or password.' }

  await writeAuditEvent(supabase, {
    actorId: data.user.id,
    actorRole: 'session',
    action: 'auth.login',
    entityType: 'profile',
    entityId: data.user.id,
  })

  return { ok: true }
}

export async function signOut(): Promise<void> {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
}
