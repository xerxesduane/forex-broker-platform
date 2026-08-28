'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { decideKyc } from '@/server/kyc'

export function KycDecisionForm({ kycCaseId }: { kycCaseId: string }) {
  const router = useRouter()
  const [reason, setReason] = useState('')
  const [pendingAction, setPendingAction] = useState<'approve' | 'reject' | null>(null)
  const [error, setError] = useState<string | null>(null)

  async function submit(decision: 'approve' | 'reject') {
    setError(null)
    if (decision === 'reject' && reason.trim().length < 10) {
      setError('Provide a reason (at least 10 characters) for rejecting this case.')
      return
    }
    setPendingAction(decision)
    const result = await decideKyc(
      kycCaseId,
      decision === 'approve'
        ? { decision: 'approve', reason: reason || undefined }
        : { decision: 'reject', reason },
    )
    setPendingAction(null)
    if (!result.ok) {
      setError(result.error)
      return
    }
    toast.success(decision === 'approve' ? 'KYC case approved.' : 'KYC case rejected.')
    router.refresh()
  }

  return (
    <div className="space-y-3">
      <Textarea
        placeholder="Reason (required to reject, optional to approve)"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        rows={3}
      />
      {error && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {error}
        </p>
      )}
      <div className="flex gap-2">
        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button disabled={pendingAction !== null}>
                {pendingAction === 'approve' ? 'Approving…' : 'Approve'}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Approve this KYC case?</AlertDialogTitle>
              <AlertDialogDescription>
                The client will be notified and can request a demo trading account. This is recorded
                as an audit event and cannot be edited afterward.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => submit('approve')}>Approve</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        <AlertDialog>
          <AlertDialogTrigger
            render={
              <Button variant="destructive" disabled={pendingAction !== null}>
                {pendingAction === 'reject' ? 'Rejecting…' : 'Reject'}
              </Button>
            }
          />
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Reject this KYC case?</AlertDialogTitle>
              <AlertDialogDescription>
                The reason above will be shown to the client and recorded as an audit event. This
                cannot be edited afterward.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => submit('reject')}>Reject</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </div>
  )
}
