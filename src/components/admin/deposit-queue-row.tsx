'use client'

import { MoneyDecisionForm } from '@/components/admin/money-decision-form'
import { decideDeposit } from '@/server/finance'

/**
 * Thin client wrapper so the deposit queue table can stay a server
 * component while the decision dialog gets its own interactivity.
 */
export function DepositQueueRow({
  depositId,
  canApprove,
  amountLabel,
}: {
  depositId: string
  canApprove: boolean
  amountLabel: string
}) {
  if (!canApprove) {
    return <span className="text-muted-foreground text-xs">View only</span>
  }

  return (
    <MoneyDecisionForm
      entityLabel="Deposit"
      amountLabel={amountLabel}
      approveLabel="Credit"
      notice="Approving posts a balanced double-entry transaction: debit deposits clearing, credit the client wallet. The client's balance is derived from that posting, never written directly."
      onDecide={(decision) => decideDeposit(depositId, decision)}
    />
  )
}
