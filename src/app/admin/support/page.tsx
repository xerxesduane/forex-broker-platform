import Link from 'next/link'
import { PageHeader } from '@/components/admin/page-header'
import { StatTile } from '@/components/charts/stat-tile'
import { PriorityBadge, TicketStatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import {
  FIRST_RESPONSE_TARGET_HOURS,
  isBreachingFirstResponse,
} from '@/domain/support/state-machine'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type TicketRow = {
  id: string
  subject: string
  category: string
  status: string
  priority: 'low' | 'medium' | 'high'
  reference_code: string | null
  created_at: string
  updated_at: string
  first_response_at: string | null
  assigned_to: string | null
  profiles: { first_name: string | null; last_name: string | null; email: string } | null
}

export default async function AdminSupportPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.SUPPORT_VIEW)

  const { data } = await supabase
    .from('support_tickets')
    .select(
      'id, subject, category, status, priority, reference_code, created_at, updated_at, first_response_at, assigned_to, profiles!client_id(first_name, last_name, email)',
    )
    .order('updated_at', { ascending: false })
    .limit(100)

  const tickets = ((data ?? []) as unknown as TicketRow[]).map((row) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
  }))

  const now = new Date()
  const open = tickets.filter((t) => t.status === 'open')
  const awaitingClient = tickets.filter((t) => t.status === 'pending')
  const unassigned = open.filter((t) => !t.assigned_to)
  const breaching = tickets.filter((t) =>
    isBreachingFirstResponse({
      priority: t.priority,
      createdAt: new Date(t.created_at),
      firstResponseAt: t.first_response_at ? new Date(t.first_response_at) : null,
      now,
    }),
  )

  return (
    <div className="space-y-6">
      <PageHeader
        title="Support inbox"
        description={`First-response targets: high ${FIRST_RESPONSE_TARGET_HOURS.high}h, medium ${FIRST_RESPONSE_TARGET_HOURS.medium}h, low ${FIRST_RESPONSE_TARGET_HOURS.low}h. Anything past its target is flagged below.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatTile label="Open" value={String(open.length)} />
        <StatTile label="Awaiting client" value={String(awaitingClient.length)} />
        <StatTile label="Unassigned" value={String(unassigned.length)} hint="nobody picked up" />
        <StatTile
          label="Past first-response target"
          value={String(breaching.length)}
          polarity="up-bad"
          deltaPercent={null}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Tickets</CardTitle>
          <CardDescription>Most recently updated first.</CardDescription>
        </CardHeader>
        <CardContent>
          {tickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">No tickets yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Reference</TableHead>
                    <TableHead>Subject</TableHead>
                    <TableHead>Client</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {tickets.map((ticket) => {
                    const overdue = isBreachingFirstResponse({
                      priority: ticket.priority,
                      createdAt: new Date(ticket.created_at),
                      firstResponseAt: ticket.first_response_at
                        ? new Date(ticket.first_response_at)
                        : null,
                      now,
                    })
                    const client = ticket.profiles
                    return (
                      <TableRow key={ticket.id}>
                        <TableCell className="font-mono text-xs">{ticket.reference_code}</TableCell>
                        <TableCell className="max-w-[20rem]">
                          <Link
                            href={`/admin/support/${ticket.id}`}
                            className="block truncate font-medium underline-offset-4 hover:underline"
                          >
                            {ticket.subject}
                          </Link>
                          {overdue ? (
                            <span className="text-xs font-medium text-red-600 dark:text-red-400">
                              No first response yet — past target
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-xs capitalize">
                              {ticket.category}
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-sm">
                          {`${client?.first_name ?? ''} ${client?.last_name ?? ''}`.trim() ||
                            client?.email}
                        </TableCell>
                        <TableCell>
                          <PriorityBadge status={ticket.priority} />
                        </TableCell>
                        <TableCell>
                          <TicketStatusBadge status={ticket.status} />
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm whitespace-nowrap">
                          {new Date(ticket.updated_at).toLocaleDateString()}
                        </TableCell>
                      </TableRow>
                    )
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
