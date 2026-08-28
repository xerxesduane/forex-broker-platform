'use server'

import { revalidatePath } from 'next/cache'
import { profileCompletionSchema, type ProfileCompletionInput } from '@/domain/profile/schema'
import { writeAuditEvent } from '@/lib/audit'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export type CompleteProfileResult =
  | { ok: true }
  | {
      ok: false
      error: string
      fieldErrors?: Partial<Record<keyof ProfileCompletionInput, string>>
    }

export async function completeProfile(input: unknown): Promise<CompleteProfileResult> {
  const parsed = profileCompletionSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Partial<Record<keyof ProfileCompletionInput, string>> = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof ProfileCompletionInput | undefined
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, error: 'Please correct the highlighted fields.', fieldErrors }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { ok: false, error: 'You must be signed in.' }

  const completedAt = new Date().toISOString()
  const { error } = await supabase
    .from('profiles')
    .update({
      first_name: parsed.data.firstName,
      last_name: parsed.data.lastName,
      date_of_birth: parsed.data.dateOfBirth,
      phone_number: parsed.data.phoneNumber,
      country_of_residence: parsed.data.countryOfResidence,
      address_line1: parsed.data.addressLine1,
      address_line2: parsed.data.addressLine2 || null,
      city: parsed.data.city,
      region: parsed.data.region || null,
      postal_code: parsed.data.postalCode,
      profile_completed_at: completedAt,
    })
    .eq('id', user.id)

  if (error) return { ok: false, error: error.message }

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'profile.complete',
    entityType: 'profile',
    entityId: user.id,
    afterState: { profileCompletedAt: completedAt },
  })

  revalidatePath('/portal')
  return { ok: true }
}
