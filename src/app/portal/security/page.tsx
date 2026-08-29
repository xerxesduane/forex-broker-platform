import { ShieldCheck, ShieldOff } from 'lucide-react'
import {
  ChangePasswordDialog,
  MfaEnrolment,
  RevokeSessionsButton,
} from '@/components/portal/security-forms'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export const dynamic = 'force-dynamic'

const EVENT_LABEL: Record<string, string> = {
  sign_in: 'Signed in',
  sign_out: 'Signed out',
  failed_password: 'Failed password attempt',
  mfa_challenge: 'Two-factor challenge',
  password_changed: 'Password changed',
  session_revoked: 'Other sessions signed out',
}

export default async function SecurityPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const [{ data: account }, { data: events }] = await Promise.all([
    supabase
      .from('profiles')
      .select('two_factor_enabled, last_login_at')
      .eq('id', profile.id)
      .single(),
    supabase
      .from('login_events')
      .select('id, kind, ip_address, user_agent, location_label, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ])

  const mfaEnabled = Boolean(account?.two_factor_enabled)

  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-muted-foreground mt-1">
          Account access and protection. Every action on this page is recorded in your activity log
          below.
        </p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                {mfaEnabled ? (
                  <ShieldCheck className="size-4 text-emerald-600" aria-hidden="true" />
                ) : (
                  <ShieldOff className="text-muted-foreground size-4" aria-hidden="true" />
                )}
                Two-factor authentication
              </CardTitle>
              <CardDescription className="mt-1">
                {mfaEnabled
                  ? 'On. A code from your authenticator app is required alongside your password.'
                  : 'Add a second step to sign-in using any authenticator app. Strongly recommended.'}
              </CardDescription>
            </div>
            <Badge variant={mfaEnabled ? 'default' : 'outline'}>
              {mfaEnabled ? 'Enabled' : 'Not enabled'}
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <MfaEnrolment enabled={mfaEnabled} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Password &amp; sessions</CardTitle>
          <CardDescription>
            Last signed in{' '}
            {account?.last_login_at ? new Date(account.last_login_at).toLocaleString() : 'just now'}{' '}
            as {profile.email}.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <ChangePasswordDialog />
          <RevokeSessionsButton />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent account activity</CardTitle>
          <CardDescription>
            Sign-ins, failed attempts and security changes. If you see something you did not do,
            change your password and contact support.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {!events || events.length === 0 ? (
            <p className="text-muted-foreground text-sm">No activity recorded yet.</p>
          ) : (
            <ul className="divide-y text-sm">
              {events.map((event) => (
                <li key={event.id} className="flex items-start justify-between gap-3 py-2">
                  <div>
                    <p className="font-medium">{EVENT_LABEL[event.kind] ?? event.kind}</p>
                    {event.location_label || event.user_agent ? (
                      <p className="text-muted-foreground text-xs">
                        {event.location_label ?? event.user_agent}
                      </p>
                    ) : null}
                  </div>
                  <span className="text-muted-foreground shrink-0 text-xs">
                    {new Date(event.created_at).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
