'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useRef, useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { EMPLOYMENT_STATUSES, SOURCE_OF_FUNDS } from '@/domain/kyc/types'
import { kycSubmissionSchema, type KycSubmissionInput } from '@/domain/kyc/schema'
import { DEMO_COUNTRIES } from '@/domain/shared/countries'
import { submitKyc } from '@/server/kyc'
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

const EMPLOYMENT_LABELS: Record<(typeof EMPLOYMENT_STATUSES)[number], string> = {
  employed: 'Employed',
  self_employed: 'Self-employed',
  unemployed: 'Unemployed',
  student: 'Student',
  retired: 'Retired',
}

const SOURCE_LABELS: Record<(typeof SOURCE_OF_FUNDS)[number], string> = {
  salary: 'Salary',
  business_income: 'Business income',
  savings: 'Savings',
  investments: 'Investments',
  inheritance: 'Inheritance',
  other: 'Other',
}

export function KycForm() {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [fileError, setFileError] = useState<string | null>(null)
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<KycSubmissionInput>({
    resolver: zodResolver(kycSubmissionSchema),
    defaultValues: {
      employmentStatus: undefined,
      sourceOfFunds: undefined,
      declaredCountry: '',
      accurateInfoConfirmed: false,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    setFileError(null)
    const file = fileInputRef.current?.files?.[0]
    if (!file) {
      setFileError('Attach a document to continue.')
      return
    }

    const formData = new FormData()
    formData.set('employmentStatus', values.employmentStatus)
    formData.set('sourceOfFunds', values.sourceOfFunds)
    formData.set('declaredCountry', values.declaredCountry)
    formData.set('accurateInfoConfirmed', String(values.accurateInfoConfirmed))
    formData.set('document', file)

    const result = await submitKyc(formData)
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    toast.success('KYC application submitted.')
    router.push('/portal/kyc')
    router.refresh()
  })

  const employmentStatus = watch('employmentStatus')
  const sourceOfFunds = watch('sourceOfFunds')
  const declaredCountry = watch('declaredCountry')

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormField
        label="Employment status"
        htmlFor="employmentStatus"
        error={errors.employmentStatus?.message}
      >
        <Select
          value={employmentStatus}
          onValueChange={(value) =>
            setValue('employmentStatus', value as KycSubmissionInput['employmentStatus'], {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger id="employmentStatus" className="w-full">
            <SelectValue placeholder="Select employment status" />
          </SelectTrigger>
          <SelectContent>
            {EMPLOYMENT_STATUSES.map((status) => (
              <SelectItem key={status} value={status}>
                {EMPLOYMENT_LABELS[status]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Source of funds"
        htmlFor="sourceOfFunds"
        error={errors.sourceOfFunds?.message}
      >
        <Select
          value={sourceOfFunds}
          onValueChange={(value) =>
            setValue('sourceOfFunds', value as KycSubmissionInput['sourceOfFunds'], {
              shouldValidate: true,
            })
          }
        >
          <SelectTrigger id="sourceOfFunds" className="w-full">
            <SelectValue placeholder="Select source of funds" />
          </SelectTrigger>
          <SelectContent>
            {SOURCE_OF_FUNDS.map((source) => (
              <SelectItem key={source} value={source}>
                {SOURCE_LABELS[source]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Declared country"
        htmlFor="declaredCountry"
        error={errors.declaredCountry?.message}
      >
        <Select
          value={declaredCountry || undefined}
          onValueChange={(value) =>
            setValue('declaredCountry', value as string, { shouldValidate: true })
          }
        >
          <SelectTrigger id="declaredCountry" className="w-full">
            <SelectValue placeholder="Select a country" />
          </SelectTrigger>
          <SelectContent>
            {DEMO_COUNTRIES.map((c) => (
              <SelectItem key={c.code} value={c.code}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField
        label="Identity document"
        htmlFor="document"
        error={fileError ?? undefined}
        description="Any small file works — this demo does not perform real document verification."
      >
        <input
          ref={fileInputRef}
          id="document"
          type="file"
          accept="image/*,.pdf"
          className="border-input file:bg-secondary w-full rounded-md border px-3 py-2 text-sm file:mr-3 file:rounded file:border-0 file:px-2 file:py-1"
        />
      </FormField>

      <div className="flex items-start gap-2">
        <Checkbox
          id="accurateInfoConfirmed"
          checked={watch('accurateInfoConfirmed')}
          onCheckedChange={(checked) =>
            setValue('accurateInfoConfirmed', checked === true, { shouldValidate: true })
          }
        />
        <label htmlFor="accurateInfoConfirmed" className="text-sm leading-snug">
          I confirm the information provided is accurate to the best of my knowledge.
        </label>
      </div>
      {errors.accurateInfoConfirmed && (
        <p role="alert" className="text-destructive -mt-3 text-xs">
          {errors.accurateInfoConfirmed.message}
        </p>
      )}

      {serverError && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Submitting…' : 'Submit KYC application'}
      </Button>
    </form>
  )
}
