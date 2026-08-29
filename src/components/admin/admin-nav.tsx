'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import {
  Activity,
  ArrowDownToLine,
  ArrowUpFromLine,
  ChartNoAxesColumn,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  Plug,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  Wallet,
  WalletCards,
} from 'lucide-react'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { cn } from '@/lib/utils'

type NavItem = {
  href: string
  label: string
  icon: typeof LayoutDashboard
  permission: string | null
  exact?: boolean
}

/**
 * Grouped rather than a flat list: fourteen destinations in one column is
 * a wall to scan, and the groups match how the work actually divides
 * between roles. A group with nothing visible in it disappears entirely,
 * so a KYC analyst never sees an empty "Money" heading.
 */
const NAV_GROUPS: { heading: string | null; items: NavItem[] }[] = [
  {
    heading: null,
    items: [
      { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true, permission: null },
    ],
  },
  {
    heading: 'Clients & compliance',
    items: [
      { href: '/admin/clients', label: 'Clients', icon: Users, permission: PERMISSIONS.CLIENT_VIEW },
      { href: '/admin/kyc', label: 'KYC queue', icon: ShieldCheck, permission: PERMISSIONS.KYC_VIEW },
      {
        href: '/admin/trading-accounts',
        label: 'Trading accounts',
        icon: WalletCards,
        permission: PERMISSIONS.TRADING_ACCOUNT_VIEW,
      },
    ],
  },
  {
    heading: 'Money',
    items: [
      {
        href: '/admin/deposits',
        label: 'Deposits',
        icon: ArrowDownToLine,
        permission: PERMISSIONS.DEPOSIT_VIEW,
      },
      {
        href: '/admin/withdrawals',
        label: 'Withdrawals',
        icon: ArrowUpFromLine,
        permission: PERMISSIONS.WITHDRAWAL_VIEW,
      },
      {
        href: '/admin/ledger',
        label: 'Wallets & ledger',
        icon: Wallet,
        permission: PERMISSIONS.LEDGER_VIEW,
      },
    ],
  },
  {
    heading: 'Growth & service',
    items: [
      {
        href: '/admin/partners',
        label: 'Partners',
        icon: Handshake,
        permission: PERMISSIONS.REFERRAL_MANAGE,
      },
      {
        href: '/admin/support',
        label: 'Support',
        icon: LifeBuoy,
        permission: PERMISSIONS.SUPPORT_VIEW,
      },
    ],
  },
  {
    heading: 'Oversight',
    items: [
      {
        href: '/admin/reports',
        label: 'Reports',
        icon: ChartNoAxesColumn,
        permission: PERMISSIONS.AUDIT_VIEW,
      },
      { href: '/admin/audit', label: 'Audit log', icon: Activity, permission: PERMISSIONS.AUDIT_VIEW },
      {
        href: '/admin/integrations',
        label: 'Integrations',
        icon: Plug,
        permission: PERMISSIONS.INTEGRATION_VIEW,
      },
    ],
  },
  {
    heading: 'Administration',
    items: [
      {
        href: '/admin/staff',
        label: 'Staff & roles',
        icon: UserCog,
        permission: PERMISSIONS.STAFF_MANAGE,
      },
      {
        href: '/admin/settings',
        label: 'Settings',
        icon: Settings,
        permission: PERMISSIONS.SETTINGS_MANAGE,
      },
    ],
  },
]

export function AdminNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname()
  const permissionSet = new Set(permissions)

  const visibleGroups = NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => !item.permission || permissionSet.has(item.permission)),
  })).filter((group) => group.items.length > 0)

  return (
    <nav className="space-y-5" aria-label="Admin sections">
      {visibleGroups.map((group, index) => (
        <div key={group.heading ?? `group-${index}`} className="space-y-1">
          {group.heading ? (
            <p className="text-muted-foreground px-3 pb-1 text-[11px] font-semibold tracking-wider uppercase">
              {group.heading}
            </p>
          ) : null}
          {group.items.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href)
            const Icon = item.icon
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={cn(
                  'flex items-center gap-2.5 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary/10 text-primary dark:bg-primary/20 dark:text-primary'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground',
                )}
              >
                <Icon
                  className={cn('size-4 shrink-0', active ? '' : 'opacity-80')}
                  aria-hidden="true"
                />
                <span className="truncate">{item.label}</span>
              </Link>
            )
          })}
        </div>
      ))}
    </nav>
  )
}
