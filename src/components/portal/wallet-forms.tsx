'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowDownToLine, ArrowUpFromLine, Loader2, Send } from 'lucide-react'
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
import { DEPOSIT_METHODS, WITHDRAWAL_METHODS } from '@/domain/finance/types'
import { formatAmount } from '@/domain/shared/money'
import {
  requestDeposit,
  requestInternalTransfer,
  requestWithdrawal,
  simulateProviderConfirmation,
} from '@/server/finance'

const selectClass = 'border-input bg-background h-9 w-full rounded-md border px-3 text-sm'

export function DepositDialog({
  minimum,
  autoCreditLimit,
  disabled,
  disabledReason,
}: {
  minimum: number
  autoCreditLimit: number
  disabled: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string>(DEPOSIT_METHODS[0].key)
  const [created, setCreated] = useState<{ depositId: string; instructions: string } | null>(null)

  const willAutoCredit = Number(amount) > 0 && Number(amount) <= autoCreditLimit

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) {
          setCreated(null)
          setAmount('')
        }
      }}
    >
      <DialogTrigger
        render={
          <Button disabled={disabled}>
            <ArrowDownToLine className="mr-1 size-4" aria-hidden="true" />
            Deposit
          </Button>
        }
      />
      <DialogContent>
        {created ? (
          <>
            <DialogHeader>
              <DialogTitle>Deposit requested</DialogTitle>
              <DialogDescription>{created.instructions}</DialogDescription>
            </DialogHeader>
            <p className="text-muted-foreground text-sm">
              In a live platform the provider would confirm this by webhook. Here you can trigger
              that step yourself, so you can watch the money reach the ledger.
            </p>
            <DialogFooter>
              <DialogClose render={<Button variant="ghost">Leave it pending</Button>} />
              <Button
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const result = await simulateProviderConfirmation(created.depositId)
                    if (!result.ok) {
                      toast.error(result.error)
                      return
                    }
                    toast.success(
                      result.value?.autoCredited
                        ? 'Provider confirmed — funds credited to your wallet.'
                        : 'Provider confirmed. Our finance team will review this deposit.',
                    )
                    setOpen(false)
                    setCreated(null)
                    router.refresh()
                  })
                }
              >
                {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Simulate provider confirmation
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Add funds</DialogTitle>
              <DialogDescription>
                {disabled
                  ? disabledReason
                  : `Minimum ${formatAmount(minimum, 'USD')}. Simulated funds only — no payment details are collected.`}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="deposit-amount">Amount (USD)</Label>
                <Input
                  id="deposit-amount"
                  type="number"
                  min={minimum}
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  placeholder="1000.00"
                />
                {Number(amount) > 0 ? (
                  <p className="text-muted-foreground text-xs">
                    {willAutoCredit
                      ? 'Credits to your wallet as soon as the provider confirms.'
                      : `Above the ${formatAmount(autoCreditLimit, 'USD')} auto-credit limit — a finance operator will review it first.`}
                  </p>
                ) : null}
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="deposit-method">Method</Label>
                <select
                  id="deposit-method"
                  className={selectClass}
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                >
                  {DEPOSIT_METHODS.map((option) => (
                    <option key={option.key} value={option.key}>
                      {option.label} — {option.settlement}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <DialogFooter>
              <DialogClose render={<Button variant="ghost">Cancel</Button>} />
              <Button
                disabled={pending || disabled || Number(amount) <= 0}
                onClick={() =>
                  startTransition(async () => {
                    const result = await requestDeposit({ amount: Number(amount), method })
                    if (!result.ok) {
                      toast.error(result.error)
                      return
                    }
                    setCreated({
                      depositId: result.value?.depositId ?? '',
                      instructions: result.value?.instructions ?? '',
                    })
                    router.refresh()
                  })
                }
              >
                {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
                Continue
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}

export function WithdrawDialog({
  available,
  minimum,
  fee,
  dualApprovalThreshold,
  disabled,
  disabledReason,
}: {
  available: number
  minimum: number
  fee: number
  dualApprovalThreshold: number
  disabled: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [amount, setAmount] = useState('')
  const [method, setMethod] = useState<string>(WITHDRAWAL_METHODS[0].key)
  const [payoutDetail, setPayoutDetail] = useState('')

  const requested = Number(amount)
  const net = requested > fee ? requested - fee : 0
  const needsTwoApprovers = requested >= dualApprovalThreshold

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" disabled={disabled}>
            <ArrowUpFromLine className="mr-1 size-4" aria-hidden="true" />
            Withdraw
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Withdraw funds</DialogTitle>
          <DialogDescription>
            {disabled
              ? disabledReason
              : `Available ${formatAmount(available, 'USD')}. A ${formatAmount(fee, 'USD')} fee applies.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="withdraw-amount">Amount (USD)</Label>
            <Input
              id="withdraw-amount"
              type="number"
              min={minimum}
              max={available}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              placeholder="500.00"
            />
            {requested > 0 ? (
              <p className="text-muted-foreground text-xs">
                You receive {formatAmount(net, 'USD')} after the {formatAmount(fee, 'USD')} fee.
                {needsTwoApprovers
                  ? ' This amount needs two separate approvers before it is paid.'
                  : ''}
              </p>
            ) : null}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="withdraw-method">Method</Label>
            <select
              id="withdraw-method"
              className={selectClass}
              value={method}
              onChange={(event) => setMethod(event.target.value)}
            >
              {WITHDRAWAL_METHODS.map((option) => (
                <option key={option.key} value={option.key}>
                  {option.label} — {option.settlement}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="withdraw-detail">Payout reference</Label>
            <Input
              id="withdraw-detail"
              value={payoutDetail}
              onChange={(event) => setPayoutDetail(event.target.value)}
              placeholder="Demo Bank ****4417"
            />
            <p className="text-muted-foreground text-xs">
              Demo values only — never enter real bank or wallet details in this environment.
            </p>
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            disabled={pending || disabled || requested <= 0 || payoutDetail.trim().length < 4}
            onClick={() =>
              startTransition(async () => {
                const result = await requestWithdrawal({
                  amount: requested,
                  method,
                  payoutDetail: payoutDetail.trim(),
                })
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                toast.success(
                  `Withdrawal requested. ${formatAmount(result.value?.net ?? net, 'USD')} will be sent once approved.`,
                )
                setOpen(false)
                setAmount('')
                setPayoutDetail('')
                router.refresh()
              })
            }
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Request withdrawal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function TransferDialog({
  available,
  disabled,
  disabledReason,
}: {
  available: number
  disabled: boolean
  disabledReason?: string
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [reference, setReference] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button variant="outline" disabled={disabled}>
            <Send className="mr-1 size-4" aria-hidden="true" />
            Transfer
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Transfer to another client</DialogTitle>
          <DialogDescription>
            {disabled
              ? disabledReason
              : `Instant, fee-free, and posted as a balanced ledger entry. Available ${formatAmount(available, 'USD')}.`}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="transfer-reference">Recipient client reference</Label>
            <Input
              id="transfer-reference"
              value={reference}
              onChange={(event) => setReference(event.target.value.toUpperCase())}
              placeholder="AM-4F2C91"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-amount">Amount (USD)</Label>
            <Input
              id="transfer-amount"
              type="number"
              min="0.01"
              max={available}
              step="0.01"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="transfer-note">Note (optional)</Label>
            <Input
              id="transfer-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="What is this for?"
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            disabled={pending || disabled || Number(amount) <= 0 || reference.trim().length < 3}
            onClick={() =>
              startTransition(async () => {
                const result = await requestInternalTransfer({
                  toReferralCode: reference.trim(),
                  amount: Number(amount),
                  note: note.trim() || undefined,
                })
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                toast.success('Transfer sent.')
                setOpen(false)
                setAmount('')
                setReference('')
                setNote('')
                router.refresh()
              })
            }
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Send transfer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

/** Lets a client push a pending deposit through the simulated provider. */
export function ConfirmDepositButton({ depositId }: { depositId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await simulateProviderConfirmation(depositId)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          toast.success(
            result.value?.autoCredited
              ? 'Credited to your wallet.'
              : 'Confirmed — awaiting a finance decision.',
          )
          router.refresh()
        })
      }
    >
      {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
      Simulate confirmation
    </Button>
  )
}
