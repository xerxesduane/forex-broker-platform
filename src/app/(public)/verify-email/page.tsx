import { MailCheck } from 'lucide-react'
import { AuthCard } from '@/components/auth/auth-card'

export default function VerifyEmailPage() {
  return (
    <AuthCard title="Check your inbox">
      <div className="flex flex-col items-center gap-3 py-4 text-center">
        <MailCheck className="text-accent-foreground size-10" aria-hidden="true" />
        <p className="text-muted-foreground text-sm">
          We&apos;ve sent a confirmation link to the email address you registered with. Follow the
          link to activate your demo account, then sign in.
        </p>
      </div>
    </AuthCard>
  )
}
