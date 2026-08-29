import { cn } from '@/lib/utils'

export type BarDatum = {
  label: string
  value: number
  /** Optional pre-formatted value for the direct label. */
  display?: string
}

/**
 * Horizontal bar chart for ranked magnitude.
 *
 * Single hue on purpose: identity is carried by the row label, so a
 * second colour would encode nothing. Every bar is directly labelled —
 * no axis to read across, and no hover needed to get the number, which
 * also satisfies the accessibility relief for colour-only encoding.
 */
export function BarChart({
  data,
  emptyMessage = 'No data yet.',
  className,
}: {
  data: BarDatum[]
  emptyMessage?: string
  className?: string
}) {
  if (data.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>
  }

  const max = Math.max(...data.map((d) => d.value), 1)

  return (
    <div className={cn('space-y-2.5', className)}>
      {data.map((datum) => {
        const percent = Math.max(datum.value > 0 ? 2 : 0, (datum.value / max) * 100)
        return (
          <div
            key={datum.label}
            className="grid grid-cols-[minmax(0,9rem)_1fr_auto] items-center gap-3"
          >
            <span className="text-muted-foreground truncate text-xs" title={datum.label}>
              {datum.label}
            </span>
            <div className="bg-muted h-2.5 overflow-hidden rounded-full" role="presentation">
              <div className="bg-chart-1 h-full rounded-full" style={{ width: `${percent}%` }} />
            </div>
            <span className="text-xs font-medium tabular-nums">
              {datum.display ?? datum.value.toLocaleString()}
            </span>
          </div>
        )
      })}
    </div>
  )
}
