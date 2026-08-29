import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { TicketThread, type ThreadMessage } from '@/components/admin/ticket-thread'
import { CloseTicketButton } from '@/components/portal/support-forms'
import { PriorityBadge, TicketStatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type MessageRow = {
  id: string
  body: string
  author_id: string
  author_role: string
  created_at: string
  profiles: { first_name: string | null; last_name: string | null } | null
}

export default async function PortalTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select('id, client_id, subject, category, status, priority, reference_code, created_at')
    .eq('id', id)
    .maybeSingle()

  if (!ticket || ticket.client_id !== profile.id) notFound()

  const { data: messageRows } = await supabase
    .from('support_ticket_messages')
    .select(
      'id, body, author_id, author_role, created_at, profiles!author_id(first_name, last_name)',
    )
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  const messages: ThreadMessage[] = ((messageRows ?? []) as unknown as MessageRow[]).map((row) => {
    const author = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    const fromClient = row.author_id === ticket.client_id
    return {
      id: row.id,
      body: row.body,
      authorRole: row.author_role,
      // Staff names are shown as a first name plus role, not a full
      // identity — a client has no reason to receive staff surnames.
      authorName: fromClient ? 'You' : `${author?.first_name ?? 'Aurion'} · Aurion Markets`,
      createdAt: row.created_at,
      fromClient,
    }
  })

  return (
    <div className="max-w-3xl space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        render={
          <Link href="/portal/support">
            <ArrowLeft className="mr-1 size-3.5" /> Back to support
          </Link>
        }
      />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{ticket.subject}</h1>
          <p className="text-muted-foreground mt-1">
            {ticket.reference_code} · opened {new Date(ticket.created_at).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <PriorityBadge status={ticket.priority} />
          <TicketStatusBadge status={ticket.status} />
          {ticket.status !== 'closed' ? <CloseTicketButton ticketId={ticket.id} /> : null}
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Conversation</CardTitle>
        </CardHeader>
        <CardContent>
          <TicketThread
            ticketId={ticket.id}
            messages={messages}
            canReply={ticket.status !== 'closed'}
            placeholder="Add anything else that would help us resolve this."
          />
        </CardContent>
      </Card>
    </div>
  )
}
