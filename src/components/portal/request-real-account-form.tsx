'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { ACCOUNT_PLANS } from '@/domain/trading-account/types'
import { requestRealAccount } from '@/server/trading-accounts'

/**
 * A live-account request. It does not provision on the spot: the request
 * queues for trading operations, which is what a regulated broker does.
 */
export function RequestRealAccountForm({ leverageOptions }: { leverageOptions: number[] }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [plan, setPlan] = useState<string>(ACCOUNT_PLANS[0].key)
  const [baseCurrency, setBaseCurrency] = useState('USD')
  const [leverage, setLeverage] = useState(String(leverageOptions[0] ?? 100))
  const [nickname, setNickname] = useState('')
  const [accepted, setAccepted] = useState(false)

  const selectedPlan = ACCOUNT_PLANS.find((option) => option.key === plan) ?? ACCOUNT_PLANS[0]
  const allowedLeverage = leverageOptions.filter((value) => value <= selectedPlan.maxLeverage)
  const selectClass = 'border-input bg-background h-9 w-full rounded-md border px-3 text-sm'

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {ACCOUNT_PLANS.map((option) => (
          <button
            key={option.key}
            type="button"
            onClick={() => {
              setPlan(option.key)
              if (Number(leverage) > option.maxLeverage) setLeverage(String(option.maxLeverage))
            }}
            className={
              plan === option.key
                ? 'border-primary rounded-lg border-2 p-3 text-left'
                : 'hover:border-muted-foreground/40 rounded-lg border p-3 text-left'
            }
          >
            <p className="font-medium">{option.name}</p>
            <p className="text-muted-foreground mt-0.5 text-xs">{option.blurb}</p>
            <p className="text-muted-foreground mt-1.5 text-xs">
              From {option.spreadFrom.toFixed(1)} pips ·{' '}
              {option.commissionPerLot > 0
                ? `$${option.commissionPerLot} per lot`
                : 'no commission'}{' '}
              · up to 1:{option.maxLeverage}
            </p>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <div className="space-y-1.5">
          <Label htmlFor="real-currency">Base currency</Label>
          <select
            id="real-currency"
            className={selectClass}
            value={baseCurrency}
            onChange={(event) => setBaseCurrency(event.target.value)}
          >
            <option value="USD">USD</option>
            <option value="EUR">EUR</option>
            <option value="GBP">GBP</option>
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="real-leverage">Leverage</Label>
          <select
            id="real-leverage"
            className={selectClass}
            value={leverage}
            onChange={(event) => setLeverage(event.target.value)}
          >
            {allowedLeverage.map((value) => (
              <option key={value} value={value}>
                1:{value}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="real-nickname">Nickname (optional)</Label>
          <Input
            id="real-nickname"
            value={nickname}
            onChange={(event) => setNickname(event.target.value)}
            placeholder="Swing account"
          />
        </div>
      </div>

      <label className="flex items-start gap-2 text-sm">
        <Checkbox checked={accepted} onCheckedChange={(checked) => setAccepted(checked === true)} />
        <span>
          I understand that leveraged trading carries a high risk of losing money rapidly, and that
          this demonstration environment does not execute real trades.
        </span>
      </label>

      <Button
        disabled={pending || !accepted}
        onClick={() =>
          startTransition(async () => {
            const result = await requestRealAccount({
              plan,
              baseCurrency,
              leverage: Number(leverage),
              nickname: nickname.trim() || undefined,
              riskWarningAccepted: accepted,
            })
            if (!result.ok) {
              toast.error(result.error)
              return
            }
            toast.success(
              result.queued
                ? 'Request submitted — our trading operations team will review it shortly.'
                : 'Account opened.',
            )
            setNickname('')
            setAccepted(false)
            router.refresh()
          })
        }
      >
        {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
        Request live account
      </Button>
    </div>
  )
}
