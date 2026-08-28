'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  demoAccountRequestSchema,
  type DemoAccountRequestInput,
} from '@/domain/trading-account/schema'
import { ALLOWED_LEVERAGE_OPTIONS } from '@/domain/trading-account/types'
import { requestDemoAccount } from '@/server/trading-accounts'
import { FormField } from '@/components/form/form-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

const CURRENCIES = ['USD', 'EUR', 'GBP'] as const

export function RequestDemoAccountForm({ onSuccess }: { onSuccess?: () => void }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<DemoAccountRequestInput>({
    resolver: zodResolver(demoAccountRequestSchema),
    defaultValues: { baseCurrency: 'USD', leverage: 100, declarationAccepted: false },
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await requestDemoAccount(values)
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    toast.success('Demo account provisioned.')
    router.push(`/portal/accounts/${result.tradingAccountId}`)
    router.refresh()
    onSuccess?.()
  })

  const baseCurrency = watch('baseCurrency')
  const leverage = watch('leverage')

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormField label="Base currency" htmlFor="baseCurrency" error={errors.baseCurrency?.message}>
        <Select
          value={baseCurrency}
          onValueChange={(value) =>
            setValue('baseCurrency', value as DemoAccountRequestInput['baseCurrency'], {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger id="baseCurrency" className="w-full">
            <SelectValue placeholder="Select a currency" />
          </SelectTrigger>
          <SelectContent>
            {CURRENCIES.map((currency) => (
              <SelectItem key={currency} value={currency}>
                {currency}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="Leverage" htmlFor="leverage" error={errors.leverage?.message}>
        <Select
          value={String(leverage)}
          onValueChange={(value) => setValue('leverage', Number(value), { shouldValidate: true })}
        >
          <SelectTrigger id="leverage" className="w-full">
            <SelectValue placeholder="Select leverage" />
          </SelectTrigger>
          <SelectContent>
            {ALLOWED_LEVERAGE_OPTIONS.map((option) => (
              <SelectItem key={option} value={String(option)}>
                1:{option}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <div className="flex items-start gap-2">
        <Checkbox
          id="declarationAccepted"
          checked={watch('declarationAccepted')}
          onCheckedChange={(checked) =>
            setValue('declarationAccepted', checked === true, { shouldValidate: true })
          }
        />
        <label htmlFor="declarationAccepted" className="text-sm leading-snug">
          I understand this is a simulated demo account with no real funds.
        </label>
      </div>
      {errors.declarationAccepted && (
        <p role="alert" className="text-destructive -mt-3 text-xs">
          {errors.declarationAccepted.message}
        </p>
      )}

      {serverError && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Provisioning…' : 'Request demo account'}
      </Button>
    </form>
  )
}
