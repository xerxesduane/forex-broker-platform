import { PageHeader } from '@/components/admin/page-header'
import { InviteStaffDialog } from '@/components/admin/invite-staff-dialog'
import { RoleMatrix } from '@/components/admin/role-matrix'
import { StatTile } from '@/components/charts/stat-tile'
import { Badge } from '@/components/ui/badge'
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
import { hasPermission, requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

type AssignmentRow = {
  id: string
  profile_id: string
  assigned_at: string
  profiles: {
    first_name: string | null
    last_name: string | null
    email: string
    last_login_at: string | null
  } | null
  roles: { name: string; key: string } | null
}

export default async function AdminStaffPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.STAFF_MANAGE)

  const canManageRoles = await hasPermission(supabase, PERMISSIONS.ROLE_MANAGE)

  const [assignmentResult, roleResult, permissionResult, rolePermissionResult] = await Promise.all([
    supabase
      .from('staff_role_assignments')
      .select(
        'id, profile_id, assigned_at, profiles!profile_id(first_name, last_name, email, last_login_at), roles!role_id(name, key)',
      )
      .order('assigned_at', { ascending: true }),
    supabase.from('roles').select('id, key, name, description'),
    supabase.from('permissions').select('id, key, description').order('key'),
    supabase.from('role_permissions').select('role_id, permission_id'),
  ])

  const assignments = ((assignmentResult.data ?? []) as unknown as AssignmentRow[]).map((row) => ({
    ...row,
    profiles: Array.isArray(row.profiles) ? row.profiles[0] : row.profiles,
    roles: Array.isArray(row.roles) ? row.roles[0] : row.roles,
  }))

  const roles = (roleResult.data ?? []) as {
    id: string
    key: string
    name: string
    description: string
  }[]
  const permissions = (permissionResult.data ?? []) as {
    id: string
    key: string
    description: string
  }[]

  const roleById = new Map(roles.map((role) => [role.id, role.key]))
  const permissionById = new Map(permissions.map((permission) => [permission.id, permission.key]))

  const granted = (
    (rolePermissionResult.data ?? []) as { role_id: string; permission_id: string }[]
  )
    .map((row) => {
      const roleKey = roleById.get(row.role_id)
      const permissionKey = permissionById.get(row.permission_id)
      return roleKey && permissionKey ? `${roleKey}:${permissionKey}` : null
    })
    .filter((value): value is string => value !== null)

  // Group assignments per person, since one member of staff can hold several roles.
  const byPerson = new Map<
    string,
    { name: string; email: string; lastLogin: string | null; roles: string[] }
  >()
  for (const assignment of assignments) {
    const key = assignment.profile_id
    const existing = byPerson.get(key)
    const roleName = assignment.roles?.name ?? 'Unknown role'
    if (existing) {
      existing.roles.push(roleName)
    } else {
      byPerson.set(key, {
        name:
          `${assignment.profiles?.first_name ?? ''} ${assignment.profiles?.last_name ?? ''}`.trim() ||
          (assignment.profiles?.email ?? 'Unknown'),
        email: assignment.profiles?.email ?? '',
        lastLogin: assignment.profiles?.last_login_at ?? null,
        roles: [roleName],
      })
    }
  }
  const people = [...byPerson.values()]

  return (
    <div className="space-y-6">
      <PageHeader
        title="Staff & roles"
        description="Roles are bundles of atomic permissions. The matrix below is the live grant table — the same keys requirePermission() checks on every server action and every row-level security policy calls has_permission() with."
        action={<InviteStaffDialog roles={roles} />}
      />

      <div className="grid gap-4 sm:grid-cols-3">
        <StatTile label="Staff accounts" value={String(people.length)} />
        <StatTile label="Roles" value={String(roles.length)} />
        <StatTile label="Atomic permissions" value={String(permissions.length)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Staff accounts</CardTitle>
        </CardHeader>
        <CardContent>
          {people.length === 0 ? (
            <p className="text-muted-foreground text-sm">No staff accounts yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Roles</TableHead>
                    <TableHead>Last sign-in</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {people.map((person) => (
                    <TableRow key={person.email}>
                      <TableCell className="font-medium">{person.name}</TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {person.email}
                      </TableCell>
                      <TableCell>
                        <span className="flex flex-wrap gap-1">
                          {person.roles.map((role) => (
                            <Badge key={role} variant="outline">
                              {role}
                            </Badge>
                          ))}
                        </span>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {person.lastLogin
                          ? new Date(person.lastLogin).toLocaleDateString()
                          : 'Never'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Role & permission matrix</CardTitle>
          <CardDescription>
            {canManageRoles
              ? 'Editable. Changing a cell takes effect immediately, everywhere — including the database policies.'
              : 'Read-only: editing the matrix needs the role.manage permission, which is deliberately separate from staff.manage.'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RoleMatrix
            roles={roles.map((role) => ({ key: role.key, name: role.name }))}
            permissions={permissions.map((permission) => ({
              key: permission.key,
              description: permission.description,
            }))}
            granted={granted}
            editable={canManageRoles}
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">What each role is for</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="space-y-3 text-sm">
            {roles.map((role) => (
              <div key={role.id}>
                <dt className="font-medium">{role.name}</dt>
                <dd className="text-muted-foreground">{role.description}</dd>
              </div>
            ))}
          </dl>
        </CardContent>
      </Card>
    </div>
  )
}
