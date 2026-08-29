import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { AdminNav } from '@/components/admin/admin-nav'
import { BrandMark, MobileNav } from '@/components/app-shell'
import { SignOutButton } from '@/components/sign-out-button'
import { ThemeToggle } from '@/components/theme-toggle'
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
  const nav = <AdminNav permissions={[...permissions]} />

  return (
    <div className="flex min-h-screen">
      <aside className="bg-sidebar hidden w-64 shrink-0 border-r lg:flex lg:flex-col">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <BrandMark href="/admin" label="Admin console" />
        </div>
        <div className="flex-1 overflow-y-auto p-4">{nav}</div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="bg-background/95 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b px-3 backdrop-blur sm:px-6">
          <MobileNav label="Admin console">{nav}</MobileNav>
          <span className="font-semibold lg:hidden">Admin console</span>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <Badge variant="outline" className="hidden sm:inline-flex">
              Staff
            </Badge>
            <span className="text-muted-foreground hidden max-w-[16rem] truncate text-sm md:inline">
              {profile.email}
            </span>
            <ThemeToggle />
            <SignOutButton />
          </div>
        </header>

        <main id="main" className="min-w-0 flex-1 p-4 sm:p-6">
          {children}
        </main>
      </div>
    </div>
  )
}
