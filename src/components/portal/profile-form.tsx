'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { profileCompletionSchema, type ProfileCompletionInput } from '@/domain/profile/schema'
import { DEMO_COUNTRIES } from '@/domain/shared/countries'
import { completeProfile } from '@/server/profile'
import { fieldAria, FormField } from '@/components/form/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'

export function ProfileForm({ defaultValues }: { defaultValues: Partial<ProfileCompletionInput> }) {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<ProfileCompletionInput>({
    resolver: zodResolver(profileCompletionSchema),
    defaultValues: {
      firstName: '',
      lastName: '',
      dateOfBirth: '',
      phoneNumber: '',
      countryOfResidence: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      region: '',
      postalCode: '',
      ...defaultValues,
    },
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await completeProfile(values)
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    toast.success('Profile saved.')
    router.push('/portal/kyc')
    router.refresh()
  })

  const country = watch('countryOfResidence')

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="First name" htmlFor="firstName" error={errors.firstName?.message}>
          <Input
            {...fieldAria('firstName', errors.firstName?.message)}
            {...register('firstName')}
          />
        </FormField>
        <FormField label="Last name" htmlFor="lastName" error={errors.lastName?.message}>
          <Input {...fieldAria('lastName', errors.lastName?.message)} {...register('lastName')} />
        </FormField>
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <FormField label="Date of birth" htmlFor="dateOfBirth" error={errors.dateOfBirth?.message}>
          <Input
            type="date"
            {...fieldAria('dateOfBirth', errors.dateOfBirth?.message)}
            {...register('dateOfBirth')}
          />
        </FormField>
        <FormField label="Phone number" htmlFor="phoneNumber" error={errors.phoneNumber?.message}>
          <Input
            {...fieldAria('phoneNumber', errors.phoneNumber?.message)}
            {...register('phoneNumber')}
          />
        </FormField>
      </div>

      <FormField
        label="Country of residence"
        htmlFor="countryOfResidence"
        error={errors.countryOfResidence?.message}
      >
        <Select
          value={country || undefined}
          onValueChange={(value) =>
            setValue('countryOfResidence', value as string, { shouldValidate: true })
          }
        >
          <SelectTrigger id="countryOfResidence" className="w-full">
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

      <FormField label="Address line 1" htmlFor="addressLine1" error={errors.addressLine1?.message}>
        <Input
          {...fieldAria('addressLine1', errors.addressLine1?.message)}
          {...register('addressLine1')}
        />
      </FormField>
      <FormField
        label="Address line 2 (optional)"
        htmlFor="addressLine2"
        error={errors.addressLine2?.message}
      >
        <Input
          {...fieldAria('addressLine2', errors.addressLine2?.message)}
          {...register('addressLine2')}
        />
      </FormField>

      <div className="grid gap-5 sm:grid-cols-3">
        <FormField label="City" htmlFor="city" error={errors.city?.message}>
          <Input {...fieldAria('city', errors.city?.message)} {...register('city')} />
        </FormField>
        <FormField
          label="Region / state (optional)"
          htmlFor="region"
          error={errors.region?.message}
        >
          <Input {...fieldAria('region', errors.region?.message)} {...register('region')} />
        </FormField>
        <FormField label="Postal code" htmlFor="postalCode" error={errors.postalCode?.message}>
          <Input
            {...fieldAria('postalCode', errors.postalCode?.message)}
            {...register('postalCode')}
          />
        </FormField>
      </div>

      {serverError && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {serverError}
        </p>
      )}

      <Button type="submit" disabled={isSubmitting}>
        {isSubmitting ? 'Saving…' : 'Save and continue'}
      </Button>
    </form>
  )
}
