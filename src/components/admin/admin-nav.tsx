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

const NAV_ITEMS = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true, permission: null },
  { href: '/admin/clients', label: 'Clients', icon: Users, permission: PERMISSIONS.CLIENT_VIEW },
  { href: '/admin/kyc', label: 'KYC queue', icon: ShieldCheck, permission: PERMISSIONS.KYC_VIEW },
  {
    href: '/admin/trading-accounts',
    label: 'Trading accounts',
    icon: WalletCards,
    permission: PERMISSIONS.TRADING_ACCOUNT_VIEW,
  },
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
  {
    href: '/admin/partners',
    label: 'Partners & commissions',
    icon: Handshake,
    permission: PERMISSIONS.REFERRAL_MANAGE,
  },
  {
    href: '/admin/reports',
    label: 'Reports',
    icon: ChartNoAxesColumn,
    permission: PERMISSIONS.AUDIT_VIEW,
  },
  {
    href: '/admin/support',
    label: 'Support tickets',
    icon: LifeBuoy,
    permission: PERMISSIONS.SUPPORT_VIEW,
  },
  {
    href: '/admin/staff',
    label: 'Staff & roles',
    icon: UserCog,
    permission: PERMISSIONS.STAFF_MANAGE,
  },
  { href: '/admin/audit', label: 'Audit log', icon: Activity, permission: PERMISSIONS.AUDIT_VIEW },
  {
    href: '/admin/integrations',
    label: 'Integrations',
    icon: Plug,
    permission: PERMISSIONS.INTEGRATION_VIEW,
  },
  {
    href: '/admin/settings',
    label: 'Settings',
    icon: Settings,
    permission: PERMISSIONS.SETTINGS_MANAGE,
  },
]

export function AdminNav({ permissions }: { permissions: string[] }) {
  const pathname = usePathname()
  const permissionSet = new Set(permissions)

  return (
    <nav className="space-y-1">
      {NAV_ITEMS.filter((item) => !item.permission || permissionSet.has(item.permission)).map(
        (item) => {
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
        },
      )}
    </nav>
  )
}
