'use server'

import { revalidatePath } from 'next/cache'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { createTicketSchema, ticketReplySchema, ticketUpdateSchema } from '@/domain/support/schema'
import { transitionTicket, type TicketStatus } from '@/domain/support/state-machine'
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

export async function createSupportTicket(
  input: unknown,
): Promise<ActionResult<{ ticketId: string; reference: string }>> {
  const parsed = createTicketSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid ticket.')

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { data: ticket, error } = await supabase
    .from('support_tickets')
    .insert({
      client_id: user.id,
      subject: parsed.data.subject,
      category: parsed.data.category,
      priority: parsed.data.priority,
      status: 'open',
    })
    .select('id, reference_code')
    .single()

  if (error || !ticket) return fail(error?.message ?? 'Could not open the ticket.')

  const { error: messageError } = await supabase.from('support_ticket_messages').insert({
    ticket_id: ticket.id,
    author_id: user.id,
    author_role: 'client',
    body: parsed.data.body,
  })
  if (messageError) return fail(messageError.message)

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'support_ticket.created',
    entityType: 'support_ticket',
    entityId: ticket.id,
    afterState: {
      subject: parsed.data.subject,
      category: parsed.data.category,
      priority: parsed.data.priority,
      reference: ticket.reference_code,
    },
  })

  revalidatePath('/portal/support')
  revalidatePath('/admin/support')
  return {
    ok: true,
    value: { ticketId: ticket.id, reference: (ticket.reference_code as string) ?? '' },
  }
}

/**
 * One reply action for both sides of the conversation. Who is replying
 * decides the resulting status via the ticket state machine — staff
 * replying moves it to "pending on client", a client replying brings it
 * back to "open" (and reopens a resolved ticket).
 */
export async function replyToTicket(input: unknown): Promise<ActionResult> {
  const parsed = ticketReplySchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid reply.')

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, client_id, status, subject, reference_code, first_response_at, assigned_to')
    .eq('id', parsed.data.ticketId)
    .single()
  if (!ticket) return fail('Ticket not found.')

  const isClient = ticket.client_id === user.id
  if (!isClient) {
    await requirePermission(supabase, PERMISSIONS.SUPPORT_MANAGE)
  }

  const staff = isClient ? null : await getActingStaff(supabase)
  const authorRole = isClient ? 'client' : (staff?.primaryRole ?? 'support_agent')

  const transition = transitionTicket(ticket.status as TicketStatus, {
    type: isClient ? 'CLIENT_REPLY' : 'STAFF_REPLY',
  })
  if (!transition.ok) return fail(transition.error.message)

  const { error: messageError } = await supabase.from('support_ticket_messages').insert({
    ticket_id: ticket.id,
    author_id: user.id,
    author_role: authorRole,
    body: parsed.data.body,
  })
  if (messageError) return fail(messageError.message)

  const serviceRole = createSupabaseServiceRoleClient()
  const updates: Record<string, unknown> = { status: transition.value }
  if (!isClient && !ticket.first_response_at) {
    updates.first_response_at = new Date().toISOString()
  }
  // A replying agent picks up an unassigned ticket, so the inbox reflects
  // who is actually handling it.
  if (!isClient && !ticket.assigned_to && staff) {
    updates.assigned_to = staff.id
  }
  await serviceRole.from('support_tickets').update(updates).eq('id', ticket.id)

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: authorRole,
    action: 'support_ticket.replied',
    entityType: 'support_ticket',
    entityId: ticket.id,
    beforeState: { status: ticket.status },
    afterState: { status: transition.value },
  })

  if (!isClient) {
    await notifyClient(serviceRole, {
      profileId: ticket.client_id as string,
      type: 'support_reply',
      title: `Reply on ${ticket.reference_code}`,
      body: `Our support team has replied to "${ticket.subject}".`,
      payload: { ticketId: ticket.id },
    })
  }

  revalidatePath('/portal/support')
  revalidatePath(`/portal/support/${ticket.id}`)
  revalidatePath('/admin/support')
  revalidatePath(`/admin/support/${ticket.id}`)
  return { ok: true }
}

/** Staff: change status, priority or owner. */
export async function updateTicket(input: unknown): Promise<ActionResult> {
  const parsed = ticketUpdateSchema.safeParse(input)
  if (!parsed.success) return fail(parsed.error.issues[0]?.message ?? 'Invalid update.')

  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.SUPPORT_MANAGE)

  const staff = await getActingStaff(supabase)
  if (!staff) return fail('Staff session not found.')

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, client_id, status, priority, assigned_to, subject, reference_code')
    .eq('id', parsed.data.ticketId)
    .single()
  if (!ticket) return fail('Ticket not found.')

  const updates: Record<string, unknown> = {}

  if (parsed.data.status && parsed.data.status !== ticket.status) {
    const event =
      parsed.data.status === 'resolved'
        ? ({ type: 'RESOLVE' } as const)
        : parsed.data.status === 'closed'
          ? ({ type: 'CLOSE' } as const)
          : ({ type: 'REOPEN' } as const)

    const transition = transitionTicket(ticket.status as TicketStatus, event)
    if (!transition.ok) return fail(transition.error.message)

    updates.status = transition.value
    if (transition.value === 'resolved') updates.resolved_at = new Date().toISOString()
  }

  if (parsed.data.priority) updates.priority = parsed.data.priority
  if (parsed.data.assignedTo !== undefined) {
    updates.assigned_to = parsed.data.assignedTo === '' ? null : parsed.data.assignedTo
  }

  if (Object.keys(updates).length === 0) return { ok: true }

  const { error } = await supabase.from('support_tickets').update(updates).eq('id', ticket.id)
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: staff.id,
    actorRole: staff.primaryRole,
    action: 'support_ticket.updated',
    entityType: 'support_ticket',
    entityId: ticket.id,
    beforeState: {
      status: ticket.status,
      priority: ticket.priority,
      assignedTo: ticket.assigned_to,
    },
    afterState: updates,
  })

  if (updates.status === 'resolved') {
    const serviceRole = createSupabaseServiceRoleClient()
    await notifyClient(serviceRole, {
      profileId: ticket.client_id as string,
      type: 'support_resolved',
      title: `${ticket.reference_code} resolved`,
      body: `We have marked "${ticket.subject}" as resolved. Reply on the ticket if you need anything else.`,
      payload: { ticketId: ticket.id },
    })
  }

  revalidatePath('/admin/support')
  revalidatePath(`/admin/support/${ticket.id}`)
  revalidatePath('/portal/support')
  return { ok: true }
}

/** Client: close their own ticket. */
export async function closeOwnTicket(ticketId: string): Promise<ActionResult> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return fail('You must be signed in.')

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, client_id, status')
    .eq('id', ticketId)
    .single()
  if (!ticket) return fail('Ticket not found.')
  if (ticket.client_id !== user.id) return fail('That is not your ticket.')

  const transition = transitionTicket(ticket.status as TicketStatus, { type: 'CLOSE' })
  if (!transition.ok) return fail(transition.error.message)

  const { error } = await supabase
    .from('support_tickets')
    .update({ status: transition.value })
    .eq('id', ticketId)
  if (error) return fail(error.message)

  await writeAuditEvent(supabase, {
    actorId: user.id,
    actorRole: 'client',
    action: 'support_ticket.closed_by_client',
    entityType: 'support_ticket',
    entityId: ticketId,
    beforeState: { status: ticket.status },
    afterState: { status: transition.value },
  })

  revalidatePath('/portal/support')
  revalidatePath(`/portal/support/${ticketId}`)
  return { ok: true }
}
