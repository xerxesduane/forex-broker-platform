import Link from 'next/link'
import { KycStatusBadge } from '@/components/status-badge'
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
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminKycQueuePage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.KYC_VIEW)

  const { data: cases } = await supabase
    .from('kyc_cases')
    .select(
      'id, status, submitted_at, employment_status, profiles!client_id(first_name, last_name, email)',
    )
    .order('submitted_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">KYC review queue</h1>
        <p className="text-muted-foreground mt-1">
          Simulated submissions — decide with a recorded reason.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">All cases</CardTitle>
        </CardHeader>
        <CardContent>
          {!cases || cases.length === 0 ? (
            <p className="text-muted-foreground text-sm">No KYC cases yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Client</TableHead>
                    <TableHead>Employment</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cases.map((c) => {
                    const client = Array.isArray(c.profiles) ? c.profiles[0] : c.profiles
                    return (
                      <TableRow key={c.id}>
                        <TableCell>
                          <Link
                            href={`/admin/kyc/${c.id}`}
                            className="font-medium underline-offset-4 hover:underline"
                          >
                            {client?.first_name} {client?.last_name}
                          </Link>
                          <p className="text-muted-foreground text-xs">{client?.email}</p>
                        </TableCell>
                        <TableCell className="capitalize">
                          {c.employment_status?.replace('_', ' ')}
                        </TableCell>
                        <TableCell>
                          {c.submitted_at ? new Date(c.submitted_at).toLocaleDateString() : '—'}
                        </TableCell>
                        <TableCell>
                          <KycStatusBadge status={c.status} />
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
