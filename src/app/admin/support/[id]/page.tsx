import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { PageHeader } from '@/components/admin/page-header'
import { TicketControls } from '@/components/admin/ticket-controls'
import { TicketThread, type ThreadMessage } from '@/components/admin/ticket-thread'
import { PriorityBadge, TicketStatusBadge } from '@/components/status-badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type MessageRow = {
  id: string
  body: string
  author_id: string
  author_role: string
  created_at: string
  profiles: { first_name: string | null; last_name: string | null; email: string } | null
}

export default async function AdminTicketPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.SUPPORT_VIEW)

  const canManage = await hasPermission(supabase, PERMISSIONS.SUPPORT_MANAGE)

  const { data: ticket } = await supabase
    .from('support_tickets')
    .select(
      'id, client_id, subject, category, status, priority, reference_code, created_at, updated_at, first_response_at, resolved_at, assigned_to, profiles!client_id(first_name, last_name, email)',
    )
    .eq('id', id)
    .maybeSingle()

  if (!ticket) notFound()

  const client = Array.isArray(ticket.profiles) ? ticket.profiles[0] : ticket.profiles

  const { data: messageRows } = await supabase
    .from('support_ticket_messages')
    .select(
      'id, body, author_id, author_role, created_at, profiles!author_id(first_name, last_name, email)',
    )
    .eq('ticket_id', id)
    .order('created_at', { ascending: true })

  const messages: ThreadMessage[] = ((messageRows ?? []) as unknown as MessageRow[]).map((row) => {
    const author = Array.isArray(row.profiles) ? row.profiles[0] : row.profiles
    return {
      id: row.id,
      body: row.body,
      authorRole: row.author_role,
      authorName:
        `${author?.first_name ?? ''} ${author?.last_name ?? ''}`.trim() ||
        author?.email ||
        'Unknown',
      createdAt: row.created_at,
      fromClient: row.author_id === ticket.client_id,
    }
  })

  const { data: staffRows } = await supabase
    .from('staff_role_assignments')
    .select('profile_id, profiles!profile_id(first_name, last_name, email)')

  type StaffRow = {
    profile_id: string
    profiles: { first_name: string | null; last_name: string | null; email: string } | null
  }
  const staffById = new Map<string, string>()
  for (const raw of (staffRows ?? []) as unknown as StaffRow[]) {
    const profile = Array.isArray(raw.profiles) ? raw.profiles[0] : raw.profiles
    staffById.set(
      raw.profile_id,
      `${profile?.first_name ?? ''} ${profile?.last_name ?? ''}`.trim() || (profile?.email ?? ''),
    )
  }
  const staff = [...staffById.entries()].map(([id_, name]) => ({ id: id_, name }))

  return (
    <div className="space-y-6">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2"
        render={
          <Link href="/admin/support">
            <ArrowLeft className="mr-1 size-3.5" /> Back to inbox
          </Link>
        }
      />

      <PageHeader
        title={ticket.subject}
        description={`${ticket.reference_code} · opened ${new Date(ticket.created_at).toLocaleString()} by ${`${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim() || client?.email}`}
        action={
          <div className="flex items-center gap-2">
            <PriorityBadge status={ticket.priority} />
            <TicketStatusBadge status={ticket.status} />
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle className="text-base">Conversation</CardTitle>
          </CardHeader>
          <CardContent>
            <TicketThread
              ticketId={ticket.id}
              messages={messages}
              canReply={canManage && ticket.status !== 'closed'}
              placeholder="Reply to the client. This is sent as a notification and recorded in the audit trail."
            />
          </CardContent>
        </Card>

        <div className="space-y-6">
          {canManage ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Routing</CardTitle>
              </CardHeader>
              <CardContent>
                <TicketControls
                  ticketId={ticket.id}
                  status={ticket.status}
                  priority={ticket.priority}
                  assignedTo={ticket.assigned_to}
                  staff={staff}
                />
              </CardContent>
            </Card>
          ) : null}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Details</CardTitle>
            </CardHeader>
            <CardContent>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Category</dt>
                  <dd className="capitalize">{ticket.category}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Client</dt>
                  <dd>
                    <Link
                      href={`/admin/clients/${ticket.client_id}`}
                      className="underline underline-offset-4"
                    >
                      Open record
                    </Link>
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">First response</dt>
                  <dd>
                    {ticket.first_response_at
                      ? new Date(ticket.first_response_at).toLocaleString()
                      : 'Not yet'}
                  </dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Resolved</dt>
                  <dd>
                    {ticket.resolved_at ? new Date(ticket.resolved_at).toLocaleString() : '—'}
                  </dd>
                </div>
              </dl>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  )
}
