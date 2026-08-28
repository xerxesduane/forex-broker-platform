'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter } from 'next/navigation'
import { registerSchema, type RegisterInput } from '@/domain/auth/schema'
import { registerClient } from '@/server/auth'
import { fieldAria, FormField } from '@/components/form/form-field'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

export function RegisterForm() {
  const router = useRouter()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<RegisterInput>({
    resolver: zodResolver(registerSchema),
    defaultValues: { email: '', password: '', confirmPassword: '', acceptTerms: false },
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await registerClient(values)
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    router.push('/verify-email')
  })

  return (
    <form onSubmit={onSubmit} className="space-y-5" noValidate>
      <FormField label="Email" htmlFor="email" error={errors.email?.message}>
        <Input
          type="email"
          autoComplete="email"
          {...fieldAria('email', errors.email?.message)}
          {...register('email')}
        />
      </FormField>

      <FormField
        label="Password"
        htmlFor="password"
        error={errors.password?.message}
        description="At least 10 characters, with upper, lower and a number."
      >
        <Input
          type="password"
          autoComplete="new-password"
          {...fieldAria('password', errors.password?.message)}
          {...register('password')}
        />
      </FormField>

      <FormField
        label="Confirm password"
        htmlFor="confirmPassword"
        error={errors.confirmPassword?.message}
      >
        <Input
          type="password"
          autoComplete="new-password"
          {...fieldAria('confirmPassword', errors.confirmPassword?.message)}
          {...register('confirmPassword')}
        />
      </FormField>

      <div className="flex items-start gap-2">
        <Checkbox
          id="acceptTerms"
          checked={watch('acceptTerms')}
          onCheckedChange={(checked) =>
            setValue('acceptTerms', checked === true, { shouldValidate: true })
          }
          aria-describedby={errors.acceptTerms ? 'acceptTerms-error' : undefined}
        />
        <label htmlFor="acceptTerms" className="text-sm leading-snug">
          I understand this is a demo environment and accept the placeholder{' '}
          <a
            href="/legal/terms-of-business"
            className="underline underline-offset-4"
            target="_blank"
            rel="noreferrer"
          >
            terms of business
          </a>
          .
        </label>
      </div>
      {errors.acceptTerms && (
        <p id="acceptTerms-error" role="alert" className="text-destructive -mt-3 text-xs">
          {errors.acceptTerms.message}
        </p>
      )}

      {serverError && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {serverError}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Creating account…' : 'Create demo account'}
      </Button>
    </form>
  )
}
