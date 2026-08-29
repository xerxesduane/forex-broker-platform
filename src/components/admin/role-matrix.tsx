'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, Lock } from 'lucide-react'
import { toast } from 'sonner'
import { Checkbox } from '@/components/ui/checkbox'
import { cn } from '@/lib/utils'
import { toggleRolePermission } from '@/server/staff'

export type MatrixRole = { key: string; name: string }
export type MatrixPermission = { key: string; description: string }

/**
 * The role/permission matrix, editable in place.
 *
 * Every cell is a real grant: ticking one writes a role_permissions row,
 * and the same permission keys are what requirePermission() checks on the
 * server and what the RLS policies call has_permission() with. There is no
 * separate "UI permissions" list that could drift from the enforced one.
 */
export function RoleMatrix({
  roles,
  permissions,
  granted,
  editable,
}: {
  roles: MatrixRole[]
  permissions: MatrixPermission[]
  /** "roleKey:permissionKey" for every grant that exists. */
  granted: string[]
  editable: boolean
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const grantedSet = new Set(granted)

  function toggle(roleKey: string, permissionKey: string, grant: boolean) {
    startTransition(async () => {
      const result = await toggleRolePermission({ roleKey, permissionKey, grant })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(grant ? 'Permission granted.' : 'Permission revoked.')
      router.refresh()
    })
  }

  // Group by the prefix before the dot, so 24 permissions stay readable.
  const groups = new Map<string, MatrixPermission[]>()
  for (const permission of permissions) {
    const group = permission.key.split('.')[0] ?? 'other'
    groups.set(group, [...(groups.get(group) ?? []), permission])
  }

  return (
    <div className="relative overflow-x-auto">
      {pending ? (
        <div className="bg-background/60 absolute inset-0 z-10 flex items-center justify-center">
          <Loader2 className="size-5 animate-spin" />
        </div>
      ) : null}
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="border-b">
            <th className="bg-background sticky left-0 py-2 pr-4 text-left font-medium">
              Permission
            </th>
            {roles.map((role) => (
              <th key={role.key} className="px-2 py-2 text-center align-bottom font-medium">
                <span className="block max-w-[5.5rem] text-xs leading-tight">{role.name}</span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {[...groups.entries()].map(([group, groupPermissions]) => (
            <>
              <tr key={`${group}-header`} className="bg-muted/50">
                <td
                  colSpan={roles.length + 1}
                  className="text-muted-foreground py-1.5 pr-4 text-xs font-semibold tracking-wide uppercase"
                >
                  {group.replace(/_/g, ' ')}
                </td>
              </tr>
              {groupPermissions.map((permission) => (
                <tr key={permission.key} className="border-b last:border-0">
                  <td className="bg-background sticky left-0 py-2 pr-4">
                    <span className="font-mono text-xs">{permission.key}</span>
                    <span className="text-muted-foreground block text-xs">
                      {permission.description}
                    </span>
                  </td>
                  {roles.map((role) => {
                    const isGranted = grantedSet.has(`${role.key}:${permission.key}`)
                    const locked = role.key === 'super_admin'
                    return (
                      <td key={role.key} className="px-2 py-2 text-center">
                        {locked ? (
                          <span
                            className="text-muted-foreground inline-flex"
                            title="Super Administrator keeps every permission by design."
                          >
                            <Lock className="size-3.5" aria-hidden="true" />
                            <span className="sr-only">Always granted</span>
                          </span>
                        ) : editable ? (
                          <Checkbox
                            checked={isGranted}
                            disabled={pending}
                            aria-label={`${permission.key} for ${role.name}`}
                            onCheckedChange={(checked) =>
                              toggle(role.key, permission.key, checked === true)
                            }
                          />
                        ) : (
                          <Check
                            className={cn(
                              'mx-auto size-4',
                              isGranted ? 'text-emerald-600' : 'text-transparent',
                            )}
                            aria-label={isGranted ? 'Granted' : 'Not granted'}
                          />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </>
          ))}
        </tbody>
      </table>
    </div>
  )
}
