'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, X } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'

export type MoneyDecisionFormProps = {
  entityLabel: string
  amountLabel: string
  /** Extra context shown in the dialog, e.g. the maker-checker state. */
  notice?: string
  onDecide: (decision: { decision: 'approve' | 'reject'; notes?: string }) => Promise<
    // Withdrawals report how many approvals are still outstanding;
    // deposits carry no payload. Both shapes are accepted.
    { ok: true; value?: { outstandingApprovals?: number } | void } | { ok: false; error: string }
  >
  disableApprove?: boolean
  approveLabel?: string
}

/**
 * The approve/reject pair used by the deposit and withdrawal queues.
 *
 * A rejection always collects a reason, because the reason is shown to the
 * client and written to the audit trail — the schema requires it and so
 * does the form, rather than letting an empty string through.
 */
export function MoneyDecisionForm({
  entityLabel,
  amountLabel,
  notice,
  onDecide,
  disableApprove = false,
  approveLabel = 'Approve',
}: MoneyDecisionFormProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [notes, setNotes] = useState('')
  const [open, setOpen] = useState<'approve' | 'reject' | null>(null)

  function submit(decision: 'approve' | 'reject') {
    startTransition(async () => {
      const result = await onDecide({ decision, notes: notes.trim() || undefined })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const outstanding = result.value ? (result.value.outstandingApprovals ?? 0) : 0
      toast.success(
        decision === 'reject'
          ? `${entityLabel} rejected. The client has been notified.`
          : outstanding > 0
            ? 'Your approval is recorded. A second approver is still required.'
            : `${entityLabel} approved.`,
      )
      setNotes('')
      setOpen(null)
      router.refresh()
    })
  }

  return (
    <div className="flex items-center gap-1.5">
      <Dialog open={open === 'approve'} onOpenChange={(next) => setOpen(next ? 'approve' : null)}>
        <DialogTrigger
          render={
            <Button size="sm" variant="outline" disabled={pending || disableApprove}>
              <Check className="mr-1 size-3.5" aria-hidden="true" />
              {approveLabel}
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {approveLabel} this {entityLabel.toLowerCase()}?
            </DialogTitle>
            <DialogDescription>{amountLabel}</DialogDescription>
          </DialogHeader>
          {notice ? (
            <p className="bg-muted text-muted-foreground rounded-md p-3 text-sm">{notice}</p>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="approve-notes">Notes (optional)</Label>
            <Textarea
              id="approve-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Anything a reviewer should know later."
              rows={3}
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
            <Button onClick={() => submit('approve')} disabled={pending}>
              {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              {approveLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={open === 'reject'} onOpenChange={(next) => setOpen(next ? 'reject' : null)}>
        <DialogTrigger
          render={
            <Button size="sm" variant="ghost" disabled={pending}>
              <X className="mr-1 size-3.5" aria-hidden="true" />
              Reject
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this {entityLabel.toLowerCase()}?</DialogTitle>
            <DialogDescription>
              {amountLabel} — the reason below is shown to the client and recorded in the audit
              trail.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="reject-notes">Reason</Label>
            <Textarea
              id="reject-notes"
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="e.g. Source-of-funds evidence does not match the declared income."
              rows={3}
              required
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
            <Button
              variant="destructive"
              onClick={() => submit('reject')}
              disabled={pending || notes.trim().length < 4}
            >
              {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
