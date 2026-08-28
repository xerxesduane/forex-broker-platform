import Link from 'next/link'
import { Button } from '@/components/ui/button'

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
  return (
    <header className="border-border/70 bg-background/95 sticky top-0 z-40 border-b backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="bg-primary text-primary-foreground flex size-8 items-center justify-center rounded-md text-sm font-bold">
            AM
          </span>
          <span className="text-lg">Aurion Markets</span>
        </Link>

        <nav className="hidden items-center gap-6 text-sm font-medium lg:flex">
          {NAV_LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <Button variant="ghost" size="sm" render={<Link href="/login">Sign in</Link>} />
          <Button size="sm" render={<Link href="/register">Open demo account</Link>} />
        </div>
      </div>
    </header>
  )
}
