'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, RefreshCw } from 'lucide-react'
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
import {
  changeAccountLifecycle,
  decideAccountProvisioning,
  syncAccountSnapshot,
} from '@/server/trading-accounts'

/** Approve or decline a queued account request. */
export function ProvisioningDecision({ tradingAccountId }: { tradingAccountId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')

  return (
    <div className="flex items-center gap-1.5">
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await decideAccountProvisioning({
              decision: 'provision',
              tradingAccountId,
            })
            if (!result.ok) {
              toast.error(result.error)
              return
            }
            toast.success('Provisioned on the simulated MT5 server.')
            router.refresh()
          })
        }
      >
        {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
        Provision
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button size="sm" variant="ghost">
              Decline
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Decline this account request?</DialogTitle>
            <DialogDescription>The reason below is shown to the client.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="decline-reason">Reason</Label>
            <Textarea
              id="decline-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Requested leverage exceeds the cap for this client's declared experience."
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
            <Button
              variant="destructive"
              disabled={pending || reason.trim().length < 10}
              onClick={() =>
                startTransition(async () => {
                  const result = await decideAccountProvisioning({
                    decision: 'reject',
                    tradingAccountId,
                    reason: reason.trim(),
                  })
                  if (!result.ok) {
                    toast.error(result.error)
                    return
                  }
                  toast.success('Request declined and the client notified.')
                  setOpen(false)
                  router.refresh()
                })
              }
            >
              {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
              Decline
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Suspend, reactivate or close an active account. */
export function AccountLifecycleDialog({
  tradingAccountId,
  status,
}: {
  tradingAccountId: string
  status: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [action, setAction] = useState(status === 'suspended' ? 'reactivate' : 'suspend')
  const [reason, setReason] = useState('')

  if (!['active', 'suspended'].includes(status)) {
    return <span className="text-muted-foreground text-xs">—</span>
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            Manage
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage trading account</DialogTitle>
          <DialogDescription>
            The change is mirrored onto the simulated MT5 login, so the platform and the trading
            server cannot disagree about whether this client can trade.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="lifecycle-action">Action</Label>
            <select
              id="lifecycle-action"
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              value={action}
              onChange={(event) => setAction(event.target.value)}
            >
              {status === 'active' ? (
                <option value="suspend">Suspend (disable trading)</option>
              ) : null}
              {status === 'suspended' ? <option value="reactivate">Reactivate</option> : null}
              <option value="close">Close permanently</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="lifecycle-reason">Reason (audited)</Label>
            <Textarea
              id="lifecycle-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            disabled={pending || reason.trim().length < 6}
            onClick={() =>
              startTransition(async () => {
                const result = await changeAccountLifecycle({
                  tradingAccountId,
                  action,
                  reason: reason.trim(),
                })
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                toast.success('Account updated.')
                setOpen(false)
                router.refresh()
              })
            }
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/**
 * Pull a fresh balance/equity/margin snapshot from the (simulated) MT5
 * server. Writes only the snapshot columns — never the ledger.
 */
export function SyncSnapshotButton({
  tradingAccountId,
  label = 'Sync from MT5',
}: {
  tradingAccountId: string
  label?: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await syncAccountSnapshot(tradingAccountId)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          toast.success('Snapshot refreshed from the simulated trading server.')
          router.refresh()
        })
      }
    >
      {pending ? (
        <Loader2 className="mr-1 size-3.5 animate-spin" />
      ) : (
        <RefreshCw className="mr-1 size-3.5" aria-hidden="true" />
      )}
      {label}
    </Button>
  )
}
