'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { MoneyDecisionForm } from '@/components/admin/money-decision-form'
import { Button } from '@/components/ui/button'
import { decideWithdrawal, markWithdrawalPaid } from '@/server/finance'

export type WithdrawalQueueRowProps = {
  withdrawalId: string
  status: string
  canApprove: boolean
  amountLabel: string
  requiresDualApproval: boolean
  /** Staff who have already signed, so a second approver knows who is on it. */
  approvals: { name: string; decision: string }[]
  /** True when the signed-in member of staff has already signed this one. */
  alreadySigned: boolean
}

export function WithdrawalQueueRow({
  withdrawalId,
  status,
  canApprove,
  amountLabel,
  requiresDualApproval,
  approvals,
  alreadySigned,
}: WithdrawalQueueRowProps) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  if (!canApprove) {
    return <span className="text-muted-foreground text-xs">View only</span>
  }

  if (status === 'approved') {
    return (
      <Button
        size="sm"
        variant="outline"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            const result = await markWithdrawalPaid(withdrawalId)
            if (!result.ok) {
              toast.error(result.error)
              return
            }
            toast.success('Marked as paid. The payout posting has been recorded.')
            router.refresh()
          })
        }
      >
        {pending ? (
          <Loader2 className="mr-1 size-3.5 animate-spin" />
        ) : (
          <Send className="mr-1 size-3.5" aria-hidden="true" />
        )}
        Mark paid
      </Button>
    )
  }

  if (status !== 'pending') {
    return <span className="text-muted-foreground text-xs">—</span>
  }

  const signedBy = approvals
    .filter((a) => a.decision === 'approve')
    .map((a) => a.name)
    .join(', ')

  const notice = requiresDualApproval
    ? alreadySigned
      ? 'You have already signed this withdrawal. Maker-checker requires the second approval to come from a different member of staff.'
      : signedBy
        ? `Above the dual-approval threshold. ${signedBy} has already signed — your approval releases it.`
        : 'Above the dual-approval threshold: this needs two distinct approvers before it can be paid.'
    : 'Below the dual-approval threshold, so a single approval releases this for payout. The funds were already reserved by a ledger posting when the client requested it.'

  return (
    <MoneyDecisionForm
      entityLabel="Withdrawal"
      amountLabel={amountLabel}
      notice={notice}
      disableApprove={alreadySigned}
      onDecide={(decision) => decideWithdrawal(withdrawalId, decision)}
    />
  )
}
