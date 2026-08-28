import Link from 'next/link'
import { Suspense } from 'react'
import { AuthCard } from '@/components/auth/auth-card'
import { LoginForm } from '@/components/auth/login-form'

export default function LoginPage() {
  return (
    <AuthCard
      title="Sign in"
      description="Client portal and admin portal share the same sign-in."
      footer={
        <>
          New here?{' '}
          <Link href="/register" className="underline underline-offset-4">
            Open a demo account
          </Link>
        </>
      }
    >
      <Suspense>
        <LoginForm />
      </Suspense>
    </AuthCard>
  )
}
