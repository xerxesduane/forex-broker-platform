'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Scale } from 'lucide-react'
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
import { postManualAdjustment } from '@/server/finance'

export type AdjustmentClient = {
  id: string
  first_name: string | null
  last_name: string | null
  email: string
}

/**
 * A manual correction to a client's wallet.
 *
 * There is no "set the balance to X" here, by design: an adjustment is a
 * balanced posting against the house account, so it shows up in the trial
 * balance like any other movement and can itself be reversed. The reason
 * is required because this is the entry an auditor will pull first.
 */
export function ManualAdjustmentDialog({ clients }: { clients: AdjustmentClient[] }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [clientId, setClientId] = useState('')
  const [amount, setAmount] = useState('')
  const [direction, setDirection] = useState<'credit_client' | 'debit_client'>('credit_client')
  const [reason, setReason] = useState('')

  function submit() {
    startTransition(async () => {
      const result = await postManualAdjustment({
        clientId,
        amount: Number(amount),
        direction,
        reason: reason.trim(),
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Adjustment posted to the ledger.')
      setOpen(false)
      setClientId('')
      setAmount('')
      setReason('')
      router.refresh()
    })
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            <Scale className="mr-1 size-3.5" aria-hidden="true" />
            Post adjustment
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Post a manual adjustment</DialogTitle>
          <DialogDescription>
            Posts a balanced transaction between the house account and the client wallet. There is
            no path in this system that sets a balance directly.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="adjust-client">Client</Label>
            <select
              id="adjust-client"
              value={clientId}
              onChange={(event) => setClientId(event.target.value)}
              className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
            >
              <option value="">Select a client…</option>
              {clients.map((client) => (
                <option key={client.id} value={client.id}>
                  {`${client.first_name ?? ''} ${client.last_name ?? ''}`.trim() || client.email}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="adjust-direction">Direction</Label>
              <select
                id="adjust-direction"
                value={direction}
                onChange={(event) =>
                  setDirection(event.target.value as 'credit_client' | 'debit_client')
                }
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
              >
                <option value="credit_client">Credit the client</option>
                <option value="debit_client">Debit the client</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="adjust-amount">Amount (USD)</Label>
              <Input
                id="adjust-amount"
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                placeholder="0.00"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="adjust-reason">Reason (permanent)</Label>
            <Textarea
              id="adjust-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              rows={3}
              placeholder="e.g. Goodwill credit for the 12 March platform outage, approved by Head of Finance."
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            onClick={submit}
            disabled={pending || !clientId || !amount || reason.trim().length < 10}
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Post adjustment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
