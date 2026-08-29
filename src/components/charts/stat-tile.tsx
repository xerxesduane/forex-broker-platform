import type { ReactNode } from 'react'
import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { Card, CardContent } from '@/components/ui/card'
import { cn } from '@/lib/utils'

export type StatTileProps = {
  label: string
  value: string
  /** Short qualifier under the value, e.g. "last 30 days". */
  hint?: string
  /** Percentage change. Positive is not automatically good — see `polarity`. */
  deltaPercent?: number | null
  /**
   * Whether a rise is good, bad, or neither. Withdrawal volume going up is
   * not a win, so the arrow colour must not assume it is.
   */
  polarity?: 'up-good' | 'up-bad' | 'neutral'
  icon?: ReactNode
  className?: string
}

/**
 * A single headline number. Deliberately not a chart: one value with a
 * comparison reads faster as text than as a plot (see the form heuristic
 * in the dataviz guidance).
 */
export function StatTile({
  label,
  value,
  hint,
  deltaPercent,
  polarity = 'neutral',
  icon,
  className,
}: StatTileProps) {
  const hasDelta = typeof deltaPercent === 'number' && Number.isFinite(deltaPercent)
  const rising = hasDelta && deltaPercent > 0
  const flat = hasDelta && Math.abs(deltaPercent) < 0.05

  const deltaTone =
    !hasDelta || flat || polarity === 'neutral'
      ? 'text-muted-foreground'
      : (rising && polarity === 'up-good') || (!rising && polarity === 'up-bad')
        ? 'text-emerald-600 dark:text-emerald-400'
        : 'text-red-600 dark:text-red-400'

  const DeltaIcon = flat ? Minus : rising ? ArrowUpRight : ArrowDownRight

  return (
    <Card className={cn('overflow-hidden', className)}>
      <CardContent className="p-4 sm:p-5">
        <div className="flex items-start justify-between gap-3">
          <p className="text-muted-foreground text-sm font-medium">{label}</p>
          {icon ? <span className="text-muted-foreground shrink-0">{icon}</span> : null}
        </div>
        <p className="mt-2 text-2xl font-semibold tracking-tight tabular-nums sm:text-3xl">
          {value}
        </p>
        <div className="mt-1.5 flex items-center gap-1.5 text-xs">
          {hasDelta ? (
            <span className={cn('inline-flex items-center gap-0.5 font-medium', deltaTone)}>
              <DeltaIcon className="size-3.5" aria-hidden="true" />
              {flat ? 'No change' : `${Math.abs(deltaPercent).toFixed(1)}%`}
            </span>
          ) : null}
          {hint ? <span className="text-muted-foreground">{hint}</span> : null}
        </div>
      </CardContent>
    </Card>
  )
}
