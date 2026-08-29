'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2, UserCheck, X } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
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
import { claimKycCase, requestKycRevision, reviewKycDocument, setKycRiskFlags } from '@/server/kyc'

/** Take ownership of a case, so two analysts never work it in parallel. */
export function ClaimCaseButton({ kycCaseId }: { kycCaseId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await claimKycCase(kycCaseId)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          toast.success('Case claimed and moved into review.')
          router.refresh()
        })
      }
    >
      {pending ? (
        <Loader2 className="mr-1 size-3.5 animate-spin" />
      ) : (
        <UserCheck className="mr-1 size-3.5" aria-hidden="true" />
      )}
      Claim case
    </Button>
  )
}

/** Accept or reject a single document, with a note on rejection. */
export function DocumentReviewButtons({
  documentId,
  reviewStatus,
}: {
  documentId: string
  reviewStatus: string
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [open, setOpen] = useState(false)
  const [note, setNote] = useState('')

  if (reviewStatus !== 'pending') {
    return (
      <Badge variant="outline" className="capitalize">
        {reviewStatus}
      </Badge>
    )
  }

  return (
    <div className="flex items-center gap-1">
      <Button
        size="sm"
        variant="ghost"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await reviewKycDocument({ documentId, reviewStatus: 'accepted' })
            if (!result.ok) {
              toast.error(result.error)
              return
            }
            toast.success('Document accepted.')
            router.refresh()
          })
        }
      >
        <Check className="size-3.5" aria-hidden="true" />
        <span className="sr-only">Accept document</span>
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogTrigger
          render={
            <Button size="sm" variant="ghost" disabled={pending}>
              <X className="size-3.5" aria-hidden="true" />
              <span className="sr-only">Reject document</span>
            </Button>
          }
        />
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject this document?</DialogTitle>
            <DialogDescription>
              Say what is wrong with it — the note is recorded against the document.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="doc-note">Note</Label>
            <Input
              id="doc-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="e.g. Expiry date is not legible."
            />
          </div>
          <DialogFooter>
            <DialogClose render={<Button variant="ghost">Cancel</Button>} />
            <Button
              variant="destructive"
              disabled={pending || note.trim().length < 4}
              onClick={() =>
                startTransition(async () => {
                  const result = await reviewKycDocument({
                    documentId,
                    reviewStatus: 'rejected',
                    note: note.trim(),
                  })
                  if (!result.ok) {
                    toast.error(result.error)
                    return
                  }
                  toast.success('Document rejected.')
                  setOpen(false)
                  router.refresh()
                })
              }
            >
              Reject
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Send the case back to the client rather than rejecting it outright. */
export function RequestRevisionDialog({ kycCaseId }: { kycCaseId: string }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [reason, setReason] = useState('')
  const [pending, startTransition] = useTransition()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button size="sm" variant="outline">
            Request more information
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask the client for more information</DialogTitle>
          <DialogDescription>
            Moves the case to &ldquo;needs revision&rdquo; and notifies the client with this
            message.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="revision-reason">What do you need?</Label>
          <Textarea
            id="revision-reason"
            rows={3}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="e.g. Please re-upload your proof of address — the one supplied is more than three months old."
          />
        </div>
        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            disabled={pending || reason.trim().length < 10}
            onClick={() =>
              startTransition(async () => {
                const result = await requestKycRevision(kycCaseId, reason.trim())
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                toast.success('Client notified.')
                setOpen(false)
                router.refresh()
              })
            }
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Send request
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

const AVAILABLE_FLAGS = [
  'pep',
  'sanctions_hit',
  'adverse_media',
  'high_risk_jurisdiction',
  'document_quality',
  'source_of_funds_unclear',
]

/** Internal risk flags on the case — never shown to the client. */
export function RiskFlagPicker({ kycCaseId, flags }: { kycCaseId: string; flags: string[] }) {
  const router = useRouter()
  const [selected, setSelected] = useState<string[]>(flags)
  const [pending, startTransition] = useTransition()
  const dirty = selected.slice().sort().join() !== flags.slice().sort().join()

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {AVAILABLE_FLAGS.map((flag) => {
          const active = selected.includes(flag)
          return (
            <button
              key={flag}
              type="button"
              onClick={() =>
                setSelected(active ? selected.filter((f) => f !== flag) : [...selected, flag])
              }
              className={
                active
                  ? 'bg-primary text-primary-foreground rounded-full px-2.5 py-1 text-xs font-medium'
                  : 'bg-muted text-muted-foreground hover:bg-muted/70 rounded-full px-2.5 py-1 text-xs'
              }
            >
              {flag.replace(/_/g, ' ')}
            </button>
          )
        })}
      </div>
      {dirty ? (
        <Button
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const result = await setKycRiskFlags(kycCaseId, selected)
              if (!result.ok) {
                toast.error(result.error)
                return
              }
              toast.success('Risk flags saved.')
              router.refresh()
            })
          }
        >
          {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
          Save flags
        </Button>
      ) : null}
    </div>
  )
}
