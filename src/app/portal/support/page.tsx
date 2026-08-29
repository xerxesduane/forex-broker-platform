import Link from 'next/link'
import { NewTicketDialog } from '@/components/portal/support-forms'
import { PriorityBadge, TicketStatusBadge } from '@/components/status-badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { loadSettings, readSetting } from '@/lib/settings'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

export default async function PortalSupportPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const [{ data: tickets }, settings] = await Promise.all([
    supabase
      .from('support_tickets')
      .select('id, subject, category, status, priority, reference_code, created_at, updated_at')
      .order('updated_at', { ascending: false }),
    loadSettings(supabase),
  ])

  const supportEmail = readSetting(settings, 'brand.support_email')
  const supportHours = readSetting(settings, 'brand.support_hours')

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
          <p className="text-muted-foreground mt-1">
            {supportHours} · {supportEmail}
          </p>
        </div>
        <NewTicketDialog />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Your tickets</CardTitle>
          <CardDescription>Most recently updated first.</CardDescription>
        </CardHeader>
        <CardContent>
          {!tickets || tickets.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              You have no tickets. Open one and our team will pick it up.
            </p>
          ) : (
            <ul className="divide-y">
              {tickets.map((ticket) => (
                <li key={ticket.id} className="flex items-start justify-between gap-3 py-3">
                  <div className="min-w-0">
                    <Link
                      href={`/portal/support/${ticket.id}`}
                      className="block truncate font-medium underline-offset-4 hover:underline"
                    >
                      {ticket.subject}
                    </Link>
                    <p className="text-muted-foreground text-xs">
                      {ticket.reference_code} · updated{' '}
                      {new Date(ticket.updated_at).toLocaleDateString()}
                    </p>
                  </div>
                  <span className="flex shrink-0 items-center gap-1.5">
                    <PriorityBadge status={ticket.priority} />
                    <TicketStatusBadge status={ticket.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
