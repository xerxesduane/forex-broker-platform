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
