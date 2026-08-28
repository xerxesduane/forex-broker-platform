import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/admin-nav'
import { SignOutButton } from '@/components/sign-out-button'
import { Badge } from '@/components/ui/badge'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { getStaffPermissions } from '@/lib/rbac/get-staff-permissions'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Every route under /admin is a per-staff authenticated console — never
// statically prerender it (also avoids build-time failures when Supabase
// env vars aren't present at build time, e.g. CI without a live database).
export const dynamic = 'force-dynamic'

export default async function AdminLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)

  if (!profile) redirect('/login?next=/admin')
  if (profile.accountKind !== 'staff') redirect('/portal')

  const permissions = await getStaffPermissions(supabase)

  return (
    <div className="flex min-h-screen">
      <aside className="bg-background hidden w-64 shrink-0 border-r lg:block">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <Link href="/admin" className="flex items-center gap-2 font-semibold">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
              AM
            </span>
            Admin console
          </Link>
        </div>
        <div className="p-4">
          <AdminNav permissions={[...permissions]} />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="bg-background flex h-16 items-center justify-between border-b px-4 sm:px-6">
          <div className="font-semibold lg:hidden">Admin console</div>
          <div className="ml-auto flex items-center gap-3">
            <Badge variant="outline">Staff</Badge>
            <span className="text-muted-foreground hidden text-sm sm:inline">{profile.email}</span>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
