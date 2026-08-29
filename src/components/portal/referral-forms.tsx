'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Copy, Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { applyForIbProgramme } from '@/server/growth'

export function CopyButton({ value, label = 'Copy' }: { value: string; label?: string }) {
  const [copied, setCopied] = useState(false)

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(value)
          setCopied(true)
          setTimeout(() => setCopied(false), 2000)
        } catch {
          toast.error('Could not copy — select the text and copy manually.')
        }
      }}
    >
      {copied ? (
        <Check className="mr-1 size-3.5" aria-hidden="true" />
      ) : (
        <Copy className="mr-1 size-3.5" aria-hidden="true" />
      )}
      {copied ? 'Copied' : label}
    </Button>
  )
}

export function IbApplicationDialog({ disabled, reason }: { disabled: boolean; reason?: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [channel, setChannel] = useState('')
  const [expected, setExpected] = useState('10')
  const [accepted, setAccepted] = useState(false)

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger render={<Button disabled={disabled}>Apply to the partner programme</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Become an Introducing Broker</DialogTitle>
          <DialogDescription>
            {disabled
              ? reason
              : 'Earn a share of the net deposits made by clients you introduce. Applications are reviewed by our partnerships team.'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ib-channel">Where do you introduce clients?</Label>
            <Input
              id="ib-channel"
              value={channel}
              onChange={(event) => setChannel(event.target.value)}
              placeholder="e.g. A trading education channel with 8,000 subscribers"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ib-expected">Expected referrals per month</Label>
            <Input
              id="ib-expected"
              type="number"
              min="1"
              value={expected}
              onChange={(event) => setExpected(event.target.value)}
            />
          </div>
          <label className="flex items-start gap-2 text-sm">
            <Checkbox
              checked={accepted}
              onCheckedChange={(checked) => setAccepted(checked === true)}
            />
            <span>
              I accept the partner terms and understand commissions are paid from credited deposits,
              not from trading losses.
            </span>
          </label>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            disabled={pending || disabled || !accepted || channel.trim().length < 4}
            onClick={() =>
              startTransition(async () => {
                const result = await applyForIbProgramme({
                  websiteOrChannel: channel.trim(),
                  expectedMonthlyReferrals: Number(expected),
                  acceptPartnerTerms: accepted,
                })
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                toast.success('Application submitted — our partnerships team will review it.')
                setOpen(false)
                router.refresh()
              })
            }
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Submit application
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
