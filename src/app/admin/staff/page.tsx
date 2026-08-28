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
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminStaffPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.STAFF_MANAGE)

  const { data: assignments } = await supabase
    .from('staff_role_assignments')
    .select(
      'id, assigned_at, profiles!profile_id(first_name, last_name, email), roles!role_id(name, key)',
    )
    .order('assigned_at', { ascending: true })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Staff &amp; roles</h1>
        <p className="text-muted-foreground mt-1">
          Seeded demo staff accounts. Role/permission editing UI is a future-phase addition — the
          catalogue itself is fully seeded (see ADR 0004).
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {!assignments || assignments.length === 0 ? (
            <p className="text-muted-foreground text-sm">No staff accounts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((a) => {
                    const profile = Array.isArray(a.profiles) ? a.profiles[0] : a.profiles
                    const role = Array.isArray(a.roles) ? a.roles[0] : a.roles
                    return (
                      <TableRow key={a.id}>
                        <TableCell>
                          {profile?.first_name} {profile?.last_name}
                        </TableCell>
                        <TableCell>{profile?.email}</TableCell>
                        <TableCell>
                          <Badge variant="outline">{role?.name}</Badge>
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
