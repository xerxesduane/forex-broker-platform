import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, XCircle } from 'lucide-react'
import { KycForm } from '@/components/portal/kyc-form'
import { KycStatusBadge } from '@/components/status-badge'
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function KycPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const { data: latestCase } = await supabase
    .from('kyc_cases')
    .select('id, status, decision_reason, submitted_at, decided_at')
    .eq('client_id', profile.id)
    .order('submitted_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return (
    <div className="max-w-2xl space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Verification (KYC)</h1>
          <p className="text-muted-foreground mt-1">
            Simulated review — no real documents required.
          </p>
        </div>
        <KycStatusBadge status={profile.kycStatus} />
      </div>

      {!profile.profileCompletedAt && (
        <Alert>
          <AlertTriangle className="size-4" />
          <AlertTitle>Complete your profile first</AlertTitle>
          <AlertDescription>
            <Link href="/portal/profile" className="underline underline-offset-4">
              Finish your profile
            </Link>{' '}
            before submitting KYC.
          </AlertDescription>
        </Alert>
      )}

      {profile.profileCompletedAt &&
        (profile.kycStatus === 'not_started' || profile.kycStatus === 'needs_revision') && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Submit your KYC application</CardTitle>
              <CardDescription>A KYC analyst will review this in the admin portal.</CardDescription>
            </CardHeader>
            <CardContent>
              <KycForm />
            </CardContent>
          </Card>
        )}

      {(profile.kycStatus === 'submitted' || profile.kycStatus === 'in_review') && (
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <Clock className="text-muted-foreground size-5" aria-hidden="true" />
            <CardTitle className="text-base">Under review</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            Your application was submitted{' '}
            {latestCase?.submitted_at ? new Date(latestCase.submitted_at).toLocaleString() : ''} and
            is waiting for a KYC analyst to review it.
          </CardContent>
        </Card>
      )}

      {profile.kycStatus === 'approved' && (
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <CheckCircle2 className="size-5 text-emerald-600" aria-hidden="true" />
            <CardTitle className="text-base">Verified</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground space-y-3 text-sm">
            <p>You&apos;re verified for this demo. You can now request a demo trading account.</p>
            <Button
              size="sm"
              render={<Link href="/portal/accounts">Request a demo account</Link>}
            />
          </CardContent>
        </Card>
      )}

      {profile.kycStatus === 'rejected' && (
        <Card>
          <CardHeader className="flex-row items-center gap-2 space-y-0">
            <XCircle className="text-destructive size-5" aria-hidden="true" />
            <CardTitle className="text-base">Application rejected</CardTitle>
          </CardHeader>
          <CardContent className="text-muted-foreground text-sm">
            {latestCase?.decision_reason || 'No reason was provided.'}
          </CardContent>
        </Card>
      )}
    </div>
  )
}
