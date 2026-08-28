'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Bell,
  LayoutDashboard,
  LifeBuoy,
  ShieldCheck,
  ShieldQuestion,
  UserRound,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-react'
import { cn } from '@/lib/utils'

const NAV_ITEMS = [
  { href: '/portal', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/portal/profile', label: 'Profile', icon: UserRound },
  { href: '/portal/kyc', label: 'Verification (KYC)', icon: ShieldCheck },
  { href: '/portal/accounts', label: 'Trading accounts', icon: WalletCards },
  { href: '/portal/wallet', label: 'Wallet', icon: Wallet },
  { href: '/portal/referrals', label: 'Referrals & rewards', icon: Users },
  { href: '/portal/support', label: 'Support', icon: LifeBuoy },
  { href: '/portal/notifications', label: 'Notifications', icon: Bell },
  { href: '/portal/security', label: 'Security', icon: ShieldQuestion },
]

export function PortalNav() {
  const pathname = usePathname()

  return (
    <nav className="space-y-1">
      {NAV_ITEMS.map((item) => {
        const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
        const Icon = item.icon
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
              active
                ? 'bg-primary text-primary-foreground'
                : 'text-muted-foreground hover:bg-muted hover:text-foreground',
            )}
          >
            <Icon className="size-4" aria-hidden="true" />
            {item.label}
          </Link>
        )
      })}
    </nav>
  )
}
