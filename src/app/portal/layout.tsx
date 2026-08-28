import Link from 'next/link'
import { redirect } from 'next/navigation'
import type { ReactNode } from 'react'
import { PortalNav } from '@/components/portal/portal-nav'
import { SignOutButton } from '@/components/sign-out-button'
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

  return (
    <div className="bg-secondary/20 flex min-h-screen">
      <aside className="bg-background hidden w-64 shrink-0 border-r lg:block">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <Link href="/" className="flex items-center gap-2 font-semibold">
            <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
              AM
            </span>
            Aurion Markets
          </Link>
        </div>
        <div className="p-4">
          <PortalNav />
        </div>
      </aside>

      <div className="flex min-h-screen flex-1 flex-col">
        <header className="bg-background flex h-16 items-center justify-between border-b px-4 sm:px-6">
          <div className="lg:hidden">
            <Link href="/" className="font-semibold">
              Aurion Markets
            </Link>
          </div>
          <div className="ml-auto flex items-center gap-3">
            <div className="hidden text-right text-sm sm:block">
              <p className="font-medium">
                {profile.firstName
                  ? `${profile.firstName} ${profile.lastName ?? ''}`
                  : profile.email}
              </p>
              <p className="text-muted-foreground text-xs">{profile.email}</p>
            </div>
            <Avatar>
              <AvatarFallback>{initials || '?'}</AvatarFallback>
            </Avatar>
            <SignOutButton />
          </div>
        </header>
        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  )
}
