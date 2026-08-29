'use client'

import { useId, useMemo, useState } from 'react'
import { cn } from '@/lib/utils'

export type TrendSeries = {
  name: string
  /** One value per point, aligned with `labels`. */
  values: number[]
  /** 'primary' uses chart-1, 'comparison' uses chart-2. */
  tone: 'primary' | 'comparison'
}

export type TrendChartProps = {
  labels: string[]
  series: TrendSeries[]
  /** Formats a value for the tooltip and the y-axis extremes. */
  format?: (value: number) => string
  height?: number
  className?: string
  emptyMessage?: string
}

const PLOT_WIDTH = 720
const PADDING = { top: 12, right: 12, bottom: 22, left: 12 }

/**
 * Line/area trend with a crosshair tooltip.
 *
 * One y-axis, always — two measures at different scales get two charts,
 * never a second axis. At most two series, matching the two categorical
 * colours that clear the CVD checks in both themes; each is named in the
 * legend and in the tooltip, so identity never rests on colour alone.
 */
export function TrendChart({
  labels,
  series,
  format = (value) => value.toLocaleString(),
  height = 200,
  className,
  emptyMessage = 'Not enough history yet.',
}: TrendChartProps) {
  const gradientId = useId()
  const [activeIndex, setActiveIndex] = useState<number | null>(null)

  const plotHeight = height - PADDING.top - PADDING.bottom
  const plotWidth = PLOT_WIDTH - PADDING.left - PADDING.right

  const { max, points } = useMemo(() => {
    const allValues = series.flatMap((s) => s.values)
    // Always include zero, so a flat high line does not look like a cliff.
    const rawMax = Math.max(...allValues, 0)
    const niceMax = rawMax === 0 ? 1 : rawMax * 1.08
    const step = labels.length > 1 ? plotWidth / (labels.length - 1) : 0

    return {
      max: niceMax,
      points: series.map((s) => ({
        ...s,
        coords: s.values.map((value, index) => ({
          x: PADDING.left + index * step,
          y: PADDING.top + plotHeight - (value / niceMax) * plotHeight,
          value,
        })),
      })),
    }
  }, [labels.length, series, plotHeight, plotWidth])

  if (labels.length < 2 || series.length === 0) {
    return <p className="text-muted-foreground text-sm">{emptyMessage}</p>
  }

  const toneClass = (tone: TrendSeries['tone']) =>
    tone === 'primary' ? 'text-chart-1' : 'text-chart-2'

  return (
    <div className={cn('space-y-3', className)}>
      {series.length > 1 ? (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
          {series.map((s) => (
            <span key={s.name} className="text-muted-foreground flex items-center gap-1.5 text-xs">
              <span
                className={cn('size-2.5 rounded-full bg-current', toneClass(s.tone))}
                aria-hidden="true"
              />
              {s.name}
            </span>
          ))}
        </div>
      ) : null}

      <div className="relative">
        <svg
          viewBox={`0 0 ${PLOT_WIDTH} ${height}`}
          className="w-full"
          style={{ height }}
          role="img"
          aria-label={`${series.map((s) => s.name).join(' and ')} over ${labels.length} periods`}
          onMouseLeave={() => setActiveIndex(null)}
        >
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0.18" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* Recessive gridlines at the quartiles. */}
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <line
              key={fraction}
              x1={PADDING.left}
              x2={PLOT_WIDTH - PADDING.right}
              y1={PADDING.top + plotHeight * fraction}
              y2={PADDING.top + plotHeight * fraction}
              className="stroke-chart-grid"
              strokeWidth="1"
            />
          ))}

          {points.map((s) => {
            const line = s.coords.map((c) => `${c.x},${c.y}`).join(' ')
            const area = `${PADDING.left},${PADDING.top + plotHeight} ${line} ${PLOT_WIDTH - PADDING.right},${PADDING.top + plotHeight}`
            return (
              <g key={s.name} className={toneClass(s.tone)}>
                {/* Only the primary series gets a fill — two overlapping
                    translucent areas read as a third, invented colour. */}
                {s.tone === 'primary' && series.length === 1 ? (
                  <polygon points={area} fill={`url(#${gradientId})`} />
                ) : null}
                <polyline
                  points={line}
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                {activeIndex !== null && s.coords[activeIndex] ? (
                  <circle
                    cx={s.coords[activeIndex].x}
                    cy={s.coords[activeIndex].y}
                    r="4.5"
                    fill="currentColor"
                    // A surface-coloured ring keeps overlapping markers legible.
                    className="stroke-background"
                    strokeWidth="2"
                  />
                ) : null}
              </g>
            )
          })}

          {/* Crosshair + generous hit targets, one per period. */}
          {activeIndex !== null ? (
            <line
              x1={points[0]?.coords[activeIndex]?.x ?? 0}
              x2={points[0]?.coords[activeIndex]?.x ?? 0}
              y1={PADDING.top}
              y2={PADDING.top + plotHeight}
              className="stroke-muted-foreground"
              strokeWidth="1"
              strokeDasharray="3 3"
            />
          ) : null}

          {labels.map((label, index) => {
            const step = plotWidth / (labels.length - 1)
            return (
              <rect
                key={`${label}-${index}`}
                x={PADDING.left + index * step - step / 2}
                y={PADDING.top}
                width={Math.max(step, 8)}
                height={plotHeight}
                fill="transparent"
                onMouseEnter={() => setActiveIndex(index)}
                onFocus={() => setActiveIndex(index)}
                tabIndex={-1}
              />
            )
          })}

          {/* Only the first and last x labels — a dense axis is noise. */}
          <text
            x={PADDING.left}
            y={height - 6}
            className="fill-muted-foreground text-[10px]"
            textAnchor="start"
          >
            {labels[0]}
          </text>
          <text
            x={PLOT_WIDTH - PADDING.right}
            y={height - 6}
            className="fill-muted-foreground text-[10px]"
            textAnchor="end"
          >
            {labels[labels.length - 1]}
          </text>
        </svg>

        {activeIndex !== null ? (
          <div
            className="bg-popover text-popover-foreground pointer-events-none absolute top-0 rounded-md border px-2.5 py-1.5 text-xs shadow-md"
            style={{
              left: `${((points[0]?.coords[activeIndex]?.x ?? 0) / PLOT_WIDTH) * 100}%`,
              transform: 'translateX(-50%)',
            }}
          >
            <p className="text-muted-foreground mb-0.5 font-medium">{labels[activeIndex]}</p>
            {points.map((s) => (
              <p key={s.name} className="flex items-center gap-1.5 tabular-nums">
                <span
                  className={cn('size-2 rounded-full bg-current', toneClass(s.tone))}
                  aria-hidden="true"
                />
                <span className="text-muted-foreground">{s.name}</span>
                <span className="font-medium">{format(s.coords[activeIndex]?.value ?? 0)}</span>
              </p>
            ))}
          </div>
        ) : null}
      </div>

      {/* The table view: the same numbers, for screen readers, print, and
          anyone who would rather read than hover. */}
      <details className="text-muted-foreground text-xs">
        <summary className="hover:text-foreground cursor-pointer">View as table</summary>
        <div className="mt-2 max-h-48 overflow-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b">
                <th className="py-1 pr-3 font-medium">Period</th>
                {series.map((s) => (
                  <th key={s.name} className="py-1 pr-3 font-medium">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, index) => (
                <tr key={`${label}-${index}`} className="border-b last:border-0">
                  <td className="py-1 pr-3">{label}</td>
                  {series.map((s) => (
                    <td key={s.name} className="py-1 pr-3 tabular-nums">
                      {format(s.values[index] ?? 0)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      <p className="text-muted-foreground text-[11px]">
        Peak {format(max / 1.08)} · {labels.length} periods
      </p>
    </div>
  )
}
