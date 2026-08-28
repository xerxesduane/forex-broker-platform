import { ShieldQuestion } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function SecurityPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Security</h1>
        <p className="text-muted-foreground mt-1">Account access and protection settings.</p>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldQuestion className="size-4" aria-hidden="true" />
              Two-factor authentication
            </CardTitle>
            <Badge variant="outline">Interface preview</Badge>
          </div>
          <CardDescription>
            Two-factor authentication is modeled in the platform and this is where clients would
            enroll — enforcement is not turned on for this demo build (staff 2FA is a non-negotiable
            for a real launch; see docs/product-plan.md phase 2).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button variant="outline" disabled>
            Enable two-factor authentication
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Active session</CardTitle>
        </CardHeader>
        <CardContent className="text-muted-foreground text-sm">
          <p>Signed in as {profile.email}.</p>
          <p className="mt-1 text-xs">
            Full device/session listing and remote sign-out are a future-phase addition.
          </p>
        </CardContent>
      </Card>
    </div>
  )
}
