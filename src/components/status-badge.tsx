import { Badge } from '@/components/ui/badge'
import { cn } from '@/lib/utils'

type Tone = 'neutral' | 'info' | 'warning' | 'success' | 'danger'

const TONE_CLASSES: Record<Tone, string> = {
  neutral: 'bg-muted text-muted-foreground border-transparent',
  info: 'bg-blue-100 text-blue-900 border-transparent dark:bg-blue-950 dark:text-blue-200',
  warning: 'bg-amber-100 text-amber-900 border-transparent dark:bg-amber-950 dark:text-amber-200',
  success:
    'bg-emerald-100 text-emerald-900 border-transparent dark:bg-emerald-950 dark:text-emerald-200',
  danger: 'bg-red-100 text-red-900 border-transparent dark:bg-red-950 dark:text-red-200',
}

const KYC_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  not_started: { label: 'Not started', tone: 'neutral' },
  submitted: { label: 'Submitted', tone: 'info' },
  in_review: { label: 'In review', tone: 'info' },
  needs_revision: { label: 'Needs revision', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
}

const TRADING_ACCOUNT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  requested: { label: 'Requested', tone: 'info' },
  provisioning: { label: 'Provisioning', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  suspended: { label: 'Suspended', tone: 'warning' },
  closed: { label: 'Closed', tone: 'neutral' },
}

function StatusBadgeBase({
  label,
  tone,
  className,
}: {
  label: string
  tone: Tone
  className?: string
}) {
  return (
    <Badge variant="outline" className={cn(TONE_CLASSES[tone], 'font-medium', className)}>
      {label}
    </Badge>
  )
}

export function KycStatusBadge({ status, className }: { status: string; className?: string }) {
  const meta = KYC_STATUS_META[status] ?? { label: status, tone: 'neutral' as Tone }
  return <StatusBadgeBase label={meta.label} tone={meta.tone} className={className} />
}

export function TradingAccountStatusBadge({
  status,
  className,
}: {
  status: string
  className?: string
}) {
  const meta = TRADING_ACCOUNT_STATUS_META[status] ?? { label: status, tone: 'neutral' as Tone }
  return <StatusBadgeBase label={meta.label} tone={meta.tone} className={className} />
}

export function DemoDataBadge({ className }: { className?: string }) {
  return (
    <Badge variant="outline" className={cn('border-accent text-accent-foreground', className)}>
      Demo data
    </Badge>
  )
}

const MONEY_MOVEMENT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'info' },
  confirmed: { label: 'Confirmed', tone: 'warning' },
  approved: { label: 'Approved', tone: 'success' },
  paid: { label: 'Paid', tone: 'success' },
  rejected: { label: 'Rejected', tone: 'danger' },
  failed: { label: 'Failed', tone: 'danger' },
  reversed: { label: 'Reversed', tone: 'neutral' },
}

const TICKET_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  open: { label: 'Open', tone: 'info' },
  pending: { label: 'Awaiting client', tone: 'warning' },
  resolved: { label: 'Resolved', tone: 'success' },
  closed: { label: 'Closed', tone: 'neutral' },
}

const PRIORITY_META: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'Low', tone: 'neutral' },
  medium: { label: 'Medium', tone: 'info' },
  high: { label: 'High', tone: 'danger' },
}

const REWARD_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Pending', tone: 'info' },
  approved: { label: 'Approved', tone: 'warning' },
  paid: { label: 'Paid', tone: 'success' },
  void: { label: 'Void', tone: 'neutral' },
}

const CLIENT_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  active: { label: 'Active', tone: 'success' },
  restricted: { label: 'Restricted', tone: 'warning' },
  suspended: { label: 'Suspended', tone: 'danger' },
  closed: { label: 'Closed', tone: 'neutral' },
}

const RISK_META: Record<string, { label: string; tone: Tone }> = {
  low: { label: 'Low risk', tone: 'success' },
  medium: { label: 'Medium risk', tone: 'warning' },
  high: { label: 'High risk', tone: 'danger' },
}

const IB_STATUS_META: Record<string, { label: string; tone: Tone }> = {
  pending: { label: 'Awaiting review', tone: 'info' },
  active: { label: 'Active', tone: 'success' },
  suspended: { label: 'Suspended', tone: 'danger' },
}

function makeBadge(meta: Record<string, { label: string; tone: Tone }>) {
  return function StatusBadge({ status, className }: { status: string; className?: string }) {
    const entry = meta[status] ?? { label: status, tone: 'neutral' as Tone }
    return <StatusBadgeBase label={entry.label} tone={entry.tone} className={className} />
  }
}

export const MoneyMovementStatusBadge = makeBadge(MONEY_MOVEMENT_STATUS_META)
export const TicketStatusBadge = makeBadge(TICKET_STATUS_META)
export const PriorityBadge = makeBadge(PRIORITY_META)
export const RewardStatusBadge = makeBadge(REWARD_STATUS_META)
export const ClientStatusBadge = makeBadge(CLIENT_STATUS_META)
export const RiskBadge = makeBadge(RISK_META)
export const IbStatusBadge = makeBadge(IB_STATUS_META)

/**
 * Marks a value that came from a simulated adapter rather than a real
 * provider. Used next to MT5 logins, provider references and balances —
 * every simulated value has to be visibly labelled, not just commented.
 */
export function SimulatedBadge({ className }: { className?: string }) {
  return (
    <Badge
      variant="outline"
      className={cn('border-dashed text-[10px] font-normal tracking-wide uppercase', className)}
    >
      Simulated
    </Badge>
  )
}
