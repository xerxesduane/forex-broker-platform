'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, StickyNote } from 'lucide-react'
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
import { addClientNote, setClientAccountStatus, setClientRiskRating } from '@/server/clients'

/**
 * Account status is a real control, not a label: the finance domain reads
 * it before allowing a deposit, withdrawal or transfer. That is why the
 * reason is mandatory and the change is audited.
 */
export function ClientStatusDialog({
  clientId,
  accountStatus,
  riskRating,
}: {
  clientId: string
  accountStatus: string
  riskRating: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [status, setStatus] = useState(accountStatus)
  const [risk, setRisk] = useState(riskRating)
  const [reason, setReason] = useState('')

  const selectClass = 'border-input bg-background h-9 w-full rounded-md border px-3 text-sm'

  function submit() {
    startTransition(async () => {
      if (status !== accountStatus) {
        const result = await setClientAccountStatus({
          clientId,
          accountStatus: status,
          reason: reason.trim(),
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
      }
      if (risk !== riskRating) {
        const result = await setClientRiskRating({
          clientId,
          riskRating: risk,
          reason: reason.trim(),
        })
        if (!result.ok) {
          toast.error(result.error)
          return
        }
      }
      toast.success('Client record updated.')
      setOpen(false)
      setReason('')
      router.refresh()
    })
  }

  const changed = status !== accountStatus || risk !== riskRating

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            Manage account
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Manage this client&apos;s account</DialogTitle>
          <DialogDescription>
            Anything other than &ldquo;Active&rdquo; blocks deposits, withdrawals and transfers at
            the server, not just in the interface.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="client-status">Account status</Label>
            <select
              id="client-status"
              className={selectClass}
              value={status}
              onChange={(event) => setStatus(event.target.value)}
            >
              <option value="active">Active</option>
              <option value="restricted">Restricted</option>
              <option value="suspended">Suspended</option>
              <option value="closed">Closed</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-risk">Risk rating</Label>
            <select
              id="client-risk"
              className={selectClass}
              value={risk}
              onChange={(event) => setRisk(event.target.value)}
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="client-reason">Reason (shown to the client, and permanent)</Label>
            <Textarea
              id="client-reason"
              rows={3}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="e.g. Source-of-funds review pending; funding paused meanwhile."
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button onClick={submit} disabled={pending || !changed || reason.trim().length < 10}>
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Save changes
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function AddClientNoteForm({ clientId }: { clientId: string }) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()

  return (
    <div className="space-y-2">
      <Textarea
        value={body}
        onChange={(event) => setBody(event.target.value)}
        rows={3}
        placeholder="Internal note. Clients never see these — there is no read policy that would let them."
      />
      <div className="flex justify-end">
        <Button
          size="sm"
          disabled={pending || body.trim().length < 4}
          onClick={() =>
            startTransition(async () => {
              const result = await addClientNote({ clientId, body: body.trim() })
              if (!result.ok) {
                toast.error(result.error)
                return
              }
              setBody('')
              toast.success('Note added.')
              router.refresh()
            })
          }
        >
          {pending ? (
            <Loader2 className="mr-1 size-3.5 animate-spin" />
          ) : (
            <StickyNote className="mr-1 size-3.5" aria-hidden="true" />
          )}
          Add note
        </Button>
      </div>
    </div>
  )
}
