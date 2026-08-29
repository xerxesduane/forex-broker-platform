import 'server-only'
import { randomUUID } from 'node:crypto'
import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Write one in-app notification.
 *
 * Always uses the service-role client: no INSERT policy exists on
 * public.notifications for any user role, because a client must never be
 * able to forge a message from the platform to themselves. Pair it with
 * sendTemplatedEmail below so a client never gets one without the other.
 */
export async function notifyClient(
  serviceRoleClient: SupabaseClient,
  input: {
    profileId: string
    type: string
    title: string
    body: string
    payload?: Record<string, unknown>
  },
): Promise<void> {
  await serviceRoleClient.from('notifications').insert({
    profile_id: input.profileId,
    type: input.type,
    title: input.title,
    body: input.body,
    payload: input.payload ?? {},
  })
}

/** Render a `{{variable}}` template from the email_templates table. */
export function renderTemplate(template: string, data: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_match, key: string) => data[key] ?? `{{${key}}}`)
}

export type SendTemplatedEmailInput = {
  templateKey: string
  to: string
  data: Record<string, string>
}

/**
 * Look up an admin-editable template, render it, and hand it to the
 * simulated email adapter. A missing template is not an error the client
 * should see — the in-app notification has already landed — so it logs
 * and returns.
 */
export async function sendTemplatedEmail(
  serviceRoleClient: SupabaseClient,
  adapters: {
    email: {
      send: (req: {
        idempotencyKey: string
        to: string
        template: string
        data: Record<string, string>
        subject?: string
        body?: string
      }) => Promise<unknown>
    }
  },
  input: SendTemplatedEmailInput,
): Promise<void> {
  const { data: template } = await serviceRoleClient
    .from('email_templates')
    .select('subject, body')
    .eq('key', input.templateKey)
    .maybeSingle()

  if (!template) {
    console.warn(`[notify] no email_templates row for "${input.templateKey}" — email skipped`)
    return
  }

  await adapters.email.send({
    idempotencyKey: randomUUID(),
    to: input.to,
    template: input.templateKey,
    data: input.data,
    subject: renderTemplate(template.subject as string, input.data),
    body: renderTemplate(template.body as string, input.data),
  })
}
