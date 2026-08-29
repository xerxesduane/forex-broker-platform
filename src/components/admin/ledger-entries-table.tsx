'use client'

import { useMemo, useState } from 'react'
import { formatAmount } from '@/domain/shared/money'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'

export type LedgerEntryRow = {
  id: string
  direction: 'debit' | 'credit'
  amount: number
  currency: string
  createdAt: string
  isCorrection: boolean
  transactionType: string | null
  accountName: string | null
  reference: string | null
}

type Filter = 'all' | 'postings' | 'corrections'

const PAGE_SIZE = 60

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'postings', label: 'Original postings' },
  { value: 'corrections', label: 'Corrections' },
]

/**
 * The entry list, filterable by whether a row is an original posting or a
 * compensating one.
 *
 * The filter exists because corrections are *supposed* to pile up here:
 * nothing in this system can edit or delete a posted entry, so every fix
 * lands as new rows at the top and can bury a day of ordinary trading.
 * Being able to separate the two is what an operator actually needs, and
 * "All" stays the default — hiding corrections by default would quietly
 * undo the guarantee the rest of this page is making.
 */
export function LedgerEntriesTable({ entries }: { entries: LedgerEntryRow[] }) {
  const [filter, setFilter] = useState<Filter>('all')

  const correctionCount = useMemo(() => entries.filter((e) => e.isCorrection).length, [entries])

  const matching = useMemo(() => {
    if (filter === 'postings') return entries.filter((e) => !e.isCorrection)
    if (filter === 'corrections') return entries.filter((e) => e.isCorrection)
    return entries
  }, [entries, filter])

  const visible = matching.slice(0, PAGE_SIZE)

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="bg-muted inline-flex rounded-md p-0.5" role="group" aria-label="Filter entries">
          {FILTERS.map((option) => (
            <Button
              key={option.value}
              type="button"
              size="sm"
              variant={filter === option.value ? 'default' : 'ghost'}
              className="h-7 px-3 text-xs"
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
            </Button>
          ))}
        </div>
        <p className="text-muted-foreground text-xs">
          Showing {visible.length} of {matching.length}
          {filter === 'all'
            ? ` recent ${matching.length === 1 ? 'entry' : 'entries'}`
            : filter === 'postings'
              ? ' original postings'
              : ' corrections'}
          {filter === 'all' && correctionCount > 0
            ? ` — ${correctionCount} ${correctionCount === 1 ? 'is a correction' : 'are corrections'}`
            : ''}
        </p>
      </div>

      {visible.length === 0 ? (
        <p className="text-muted-foreground text-sm">Nothing matches this filter.</p>
      ) : (
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>When</TableHead>
                <TableHead>Type</TableHead>
                <TableHead>Account</TableHead>
                <TableHead>Reference</TableHead>
                <TableHead className="text-right">Debit</TableHead>
                <TableHead className="text-right">Credit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((entry) => (
                <TableRow key={entry.id}>
                  <TableCell className="text-muted-foreground text-xs whitespace-nowrap">
                    {new Date(entry.createdAt).toLocaleString()}
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <Badge variant="outline" className="capitalize">
                      {entry.transactionType?.replace('_', ' ') ?? '—'}
                    </Badge>
                    {entry.isCorrection ? (
                      <Badge variant="secondary" className="ml-1">
                        reversal
                      </Badge>
                    ) : null}
                  </TableCell>
                  <TableCell className="max-w-[16rem] truncate text-sm">
                    {entry.accountName ?? '—'}
                  </TableCell>
                  <TableCell className="text-muted-foreground max-w-[14rem] truncate font-mono text-xs">
                    {entry.reference ?? '—'}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {entry.direction === 'debit' ? formatAmount(entry.amount, entry.currency) : ''}
                  </TableCell>
                  <TableCell className="text-right tabular-nums">
                    {entry.direction === 'credit' ? formatAmount(entry.amount, entry.currency) : ''}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  )
}
