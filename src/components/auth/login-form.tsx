'use client'

import { zodResolver } from '@hookform/resolvers/zod'
import { useState } from 'react'
import { useForm } from 'react-hook-form'
import { useRouter, useSearchParams } from 'next/navigation'
import { loginSchema, type LoginInput } from '@/domain/auth/schema'
import { loginClient } from '@/server/auth'
import { fieldAria, FormField } from '@/components/form/form-field'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

export function LoginForm() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [serverError, setServerError] = useState<string | null>(null)
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  })

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null)
    const result = await loginClient(values)
    if (!result.ok) {
      setServerError(result.error)
      return
    }
    const next = searchParams.get('next')
    router.push(next && next.startsWith('/') ? next : '/portal')
    router.refresh()
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

      <FormField label="Password" htmlFor="password" error={errors.password?.message}>
        <Input
          type="password"
          autoComplete="current-password"
          {...fieldAria('password', errors.password?.message)}
          {...register('password')}
        />
      </FormField>

      {serverError && (
        <p role="alert" className="bg-destructive/10 text-destructive rounded-md px-3 py-2 text-sm">
          {serverError}
        </p>
      )}

      <Button type="submit" className="w-full" disabled={isSubmitting}>
        {isSubmitting ? 'Signing in…' : 'Sign in'}
      </Button>
    </form>
  )
}
