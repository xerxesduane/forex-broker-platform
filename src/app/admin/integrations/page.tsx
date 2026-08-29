import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { INTEGRATIONS_MODE } from '@/lib/adapters'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

const ADAPTERS = ['mt5', 'kyc_provider', 'document_storage', 'payments', 'email', 'sms'] as const

export const dynamic = 'force-dynamic'

export default async function AdminIntegrationsPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.INTEGRATION_VIEW)

  const { data: events } = await supabase
    .from('integration_events')
    .select(
      'id, adapter, event_type, status, simulation, created_at, completed_at, error_message, idempotency_key',
    )
    .order('created_at', { ascending: false })
    .limit(80)

  const summaries = ADAPTERS.map((adapter) => {
    const adapterEvents = (events ?? []).filter((e) => e.adapter === adapter)
    const lastEvent = adapterEvents[0]
    const failures = adapterEvents.filter((e) => e.status === 'failed').length
    return { adapter, lastEvent, count: adapterEvents.length, failures }
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Integration status</h1>
          <p className="text-muted-foreground mt-1 max-w-2xl">
            Every call through every adapter writes a row here, with its idempotency key — so a
            retry can be told apart from a duplicate, and any provider interaction can be reconciled
            after the fact. No adapter in this build talks to a real provider.
          </p>
        </div>
        <Badge variant="outline" className="uppercase">
          Mode: {INTEGRATIONS_MODE}
        </Badge>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {summaries.map((s) => (
          <Card key={s.adapter}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm capitalize">{s.adapter.replace('_', ' ')}</CardTitle>
            </CardHeader>
            <CardContent className="text-sm">
              <p>{s.count} recent calls</p>
              <p className={s.failures > 0 ? 'text-destructive' : 'text-muted-foreground'}>
                {s.failures} failures
              </p>
              {s.lastEvent && (
                <p className="text-muted-foreground mt-1 text-xs">
                  Last: {new Date(s.lastEvent.created_at).toLocaleString()}
                </p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent integration events</CardTitle>
        </CardHeader>
        <CardContent>
          {!events || events.length === 0 ? (
            <p className="text-muted-foreground text-sm">No integration calls recorded yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Adapter</TableHead>
                    <TableHead>Event</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Simulation</TableHead>
                    <TableHead>When</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="capitalize">
                        {event.adapter.replace('_', ' ')}
                      </TableCell>
                      <TableCell>{event.event_type}</TableCell>
                      <TableCell>
                        <Badge variant={event.status === 'failed' ? 'destructive' : 'outline'}>
                          {event.status}
                        </Badge>
                      </TableCell>
                      <TableCell>{event.simulation ? 'Yes' : 'No'}</TableCell>
                      <TableCell>{new Date(event.created_at).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
