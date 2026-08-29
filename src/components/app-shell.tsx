'use client'

import { useState, type ReactNode } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { Menu } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '@/components/ui/sheet'

/**
 * The sidebar drawer for narrow screens.
 *
 * Both shells previously hid their sidebar below `lg` with nothing in its
 * place, so on a phone or a split-screen laptop the console had no
 * navigation at all. The same nav component renders in both places, so
 * the two can never drift apart.
 */
export function MobileNav({ children, label }: { children: ReactNode; label: string }) {
  const [open, setOpen] = useState(false)
  const pathname = usePathname()

  // Close on navigation — a drawer that stays open over the page you just
  // asked for is the classic mobile-nav annoyance.
  const [lastPath, setLastPath] = useState(pathname)
  if (pathname !== lastPath) {
    setLastPath(pathname)
    if (open) setOpen(false)
  }

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger
        render={
          <Button variant="ghost" size="sm" className="lg:hidden" aria-label="Open navigation">
            <Menu className="size-5" aria-hidden="true" />
          </Button>
        }
      />
      <SheetContent side="left" className="w-72 p-0">
        <div className="flex h-16 items-center gap-2 border-b px-4">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
            AM
          </span>
          <SheetTitle className="text-base font-semibold">{label}</SheetTitle>
        </div>
        <div className="overflow-y-auto p-4">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

/** Brand lockup, shared by both shells so they stay identical. */
export function BrandMark({ href, label }: { href: string; label: string }) {
  return (
    <Link
      href={href}
      className="focus-visible:ring-ring flex items-center gap-2 rounded-md font-semibold tracking-tight"
    >
      <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
        AM
      </span>
      {label}
    </Link>
  )
}
