import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Wraps a wide table so it scrolls inside its own bounds instead of
 * pushing the page sideways, and says so — an edge that simply clips is
 * a column the reader never finds out exists.
 */
export function DataTableShell({
  children,
  className,
  hint = 'Scroll sideways for more columns',
}: {
  children: ReactNode
  className?: string
  hint?: string
}) {
  return (
    <div className={cn('space-y-2', className)}>
      <div className="-mx-1 overflow-x-auto px-1">{children}</div>
      <p className="text-muted-foreground text-xs md:hidden">{hint}</p>
    </div>
  )
}
