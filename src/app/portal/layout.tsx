import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { BrandMark, MobileNav } from '@/components/app-shell'
import { PortalNav } from '@/components/portal/portal-nav'
import { SignOutButton } from '@/components/sign-out-button'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

// Every route under /portal is a per-user authenticated dashboard — never
// statically prerender it (also avoids build-time failures when Supabase
// env vars aren't present at build time, e.g. CI without a live database).
export const dynamic = 'force-dynamic'

export default async function PortalLayout({ children }: { children: ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)

  if (!profile) redirect('/login?next=/portal')

  const initials =
    `${profile.firstName?.[0] ?? profile.email[0]}${profile.lastName?.[0] ?? ''}`.toUpperCase()
  const displayName = profile.firstName
    ? `${profile.firstName} ${profile.lastName ?? ''}`.trim()
    : profile.email

  return (
    <div className="bg-secondary/20 flex min-h-screen">
      <aside className="bg-background hidden w-64 shrink-0 border-r lg:flex lg:flex-col">
        <div className="flex h-16 shrink-0 items-center gap-2 border-b px-4">
          <BrandMark href="/" label="Aurion Markets" />
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          <PortalNav />
        </div>
      </aside>

      <div className="flex min-h-screen min-w-0 flex-1 flex-col">
        <header className="bg-background/95 sticky top-0 z-30 flex h-16 shrink-0 items-center gap-2 border-b px-3 backdrop-blur sm:px-6">
          <MobileNav label="Aurion Markets">
            <PortalNav />
          </MobileNav>
          <span className="font-semibold lg:hidden">Aurion Markets</span>

          <div className="ml-auto flex items-center gap-2 sm:gap-3">
            <div className="hidden text-right text-sm sm:block">
              <p className="max-w-[14rem] truncate font-medium">{displayName}</p>
              <p className="text-muted-foreground max-w-[14rem] truncate text-xs">
                {profile.email}
              </p>
            </div>
            <Avatar>
              <AvatarFallback>{initials || '?'}</AvatarFallback>
            </Avatar>
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
