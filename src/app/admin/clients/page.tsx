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

export default async function AdminClientsPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.CLIENT_VIEW)

  const { data: clients } = await supabase
    .from('profiles')
    .select('id, first_name, last_name, email, kyc_status, created_at')
    .eq('account_kind', 'client')
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Clients</h1>
        <p className="text-muted-foreground mt-1">Demo client accounts.</p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All clients</CardTitle>
        </CardHeader>
        <CardContent>
          {!clients || clients.length === 0 ? (
            <p className="text-muted-foreground text-sm">No clients yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>KYC status</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clients.map((client) => (
                    <TableRow key={client.id}>
                      <TableCell>
                        <Link
                          href={`/admin/clients/${client.id}`}
                          className="font-medium underline-offset-4 hover:underline"
                        >
                          {client.first_name || client.last_name
                            ? `${client.first_name ?? ''} ${client.last_name ?? ''}`.trim()
                            : '(profile incomplete)'}
                        </Link>
                      </TableCell>
                      <TableCell>{client.email}</TableCell>
                      <TableCell>
                        <KycStatusBadge status={client.kyc_status} />
                      </TableCell>
                      <TableCell>{new Date(client.created_at).toLocaleDateString()}</TableCell>
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
