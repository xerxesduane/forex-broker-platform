'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
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
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { decideCommission, payCommission, payRebate, setIbStatus } from '@/server/growth'

export function PartnerStatusDialog({
  ibId,
  ibCode,
  status,
  commissionBps,
}: {
  ibId: string
  ibCode: string
  status: string
  commissionBps: number
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [nextStatus, setNextStatus] = useState(status)
  const [bps, setBps] = useState(String(commissionBps))
  const [reason, setReason] = useState('')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            {status === 'pending' ? 'Review' : 'Manage'}
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Partner {ibCode}</DialogTitle>
          <DialogDescription>
            Set the partner&apos;s state and commission rate. A rank benefit, where the partner has
            earned one, overrides this rate when a commission is calculated.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ib-status">Status</Label>
            <select
              id="ib-status"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={nextStatus}
              onChange={(event) => setNextStatus(event.target.value)}
            >
              <option value="pending">Awaiting review</option>
              <option value="active">Active</option>
              <option value="suspended">Suspended</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ib-bps">Commission (basis points)</Label>
            <Input
              id="ib-bps"
              type="number"
              min="0"
              max="2000"
              value={bps}
              onChange={(event) => setBps(event.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {(Number(bps) / 100).toFixed(2)}% of a referred client&apos;s net deposits.
            </p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ib-reason">Reason (audited)</Label>
            <Textarea
              id="ib-reason"
              rows={2}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Approved after channel review."
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const result = await setIbStatus({
                  ibId,
                  status: nextStatus,
                  commissionBps: Number(bps),
                  reason: reason.trim() || undefined,
                })
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                toast.success('Partner updated.')
                setOpen(false)
                router.refresh()
              })
            }
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CommissionActions({
  commissionId,
  status,
}: {
  commissionId: string
  status: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function run(work: () => Promise<{ ok: true } | { ok: false; error: string }>, success: string) {
    startTransition(async () => {
      const result = await work()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(success)
      router.refresh()
    })
  }

  if (status === 'pending') {
    return (
      <div className="flex justify-end gap-1.5">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(
              () => decideCommission({ commissionId, decision: 'approve' }),
              'Commission approved — it is now payable.',
            )
          }
        >
          {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Approve
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={pending}
          onClick={() =>
            run(() => decideCommission({ commissionId, decision: 'void' }), 'Commission voided.')
          }
        >
          Void
        </Button>
      </div>
    )
  }

  if (status === 'approved') {
    return (
      <div className="flex justify-end">
        <Button
          size="sm"
          variant="outline"
          disabled={pending}
          onClick={() =>
            run(() => payCommission(commissionId), 'Paid — posted to the partner wallet.')
          }
        >
          {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Pay
        </Button>
      </div>
    )
  }

  return <span className="text-muted-foreground block text-right text-xs">—</span>
}

export function RebatePayButton({ rebateId, status }: { rebateId: string; status: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (status === 'paid' || status === 'void') {
    return <span className="text-muted-foreground block text-right text-xs">—</span>
  }

  return (
    <div className="flex justify-end">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await payRebate(rebateId)
            if (!result.ok) {
              toast.error(result.error)
              return
            }
            toast.success('Rebate credited to the client wallet.')
            router.refresh()
          })
        }
      >
        {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
        Pay
      </Button>
    </div>
  )
}
