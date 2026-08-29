'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { ThemeToggle } from '@/components/theme-toggle'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'
import { cn } from '@/lib/utils'

const NAV_LINKS = [
  { href: '/trading', label: 'Trading' },
  { href: '/account-types', label: 'Account types' },
  { href: '/instruments', label: 'Instruments' },
  { href: '/platforms', label: 'Platforms' },
  { href: '/conditions', label: 'Conditions' },
  { href: '/partners', label: 'Partners' },
  { href: '/about', label: 'About' },
  { href: '/contact', label: 'Contact' },
]

export function SiteHeader() {
  const pathname = usePathname()
  const [open, setOpen] = useState(false)
  const [lastPath, setLastPath] = useState(pathname)

  if (pathname !== lastPath) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  return (
    <header className="border-border/70 bg-background/80 sticky top-0 z-40 border-b backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link
          href="/"
          className="flex shrink-0 items-center gap-2 rounded-md font-semibold tracking-tight"
        >
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
            AM
          </span>
          <span className="text-lg">Aurion Markets</span>
        </Link>

        {/* Eight links only fit comfortably from xl up; below that they
            wrap or crowd the sign-in buttons, so they move into the sheet. */}
        <nav className="hidden items-center gap-5 text-sm font-medium xl:flex">
          {NAV_LINKS.map((link) => {
            const active = pathname.startsWith(link.href)
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'rounded-sm transition-colors',
                  active ? 'text-foreground font-semibold' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {link.label}
              </Link>
            )
          })}
        </nav>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <ThemeToggle className="hidden sm:inline-flex" />
          <Button
            variant="ghost"
            size="sm"
            className="hidden sm:inline-flex"
            render={<Link href="/login">Sign in</Link>}
          />
          <Button size="sm" render={<Link href="/register">Open demo account</Link>} />

          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger
              render={
                <Button variant="ghost" size="sm" className="xl:hidden" aria-label="Open menu">
                  <Menu className="size-5" aria-hidden="true" />
                </Button>
              }
            />
            <SheetContent side="right" className="w-72 p-0">
              <div className="flex h-16 items-center border-b px-4">
                <SheetTitle className="text-base font-semibold">Aurion Markets</SheetTitle>
              </div>
              <nav className="flex flex-col p-2">
                {NAV_LINKS.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    className={cn(
                      'rounded-md px-3 py-2.5 text-sm font-medium transition-colors',
                      pathname.startsWith(link.href)
                        ? 'bg-primary text-primary-foreground'
                        : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                    )}
                  >
                    {link.label}
                  </Link>
                ))}
                <div className="mt-2 flex items-center justify-between border-t px-3 pt-3">
                  <Link href="/login" className="text-sm font-medium underline underline-offset-4">
                    Sign in
                  </Link>
                  <ThemeToggle />
                </div>
              </nav>
            </SheetContent>
          </Sheet>
        </div>
      </div>
    </header>
  )
}
