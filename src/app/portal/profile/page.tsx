import { ProfileForm } from '@/components/portal/profile-form'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function ProfilePage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select(
      'first_name, last_name, date_of_birth, phone_number, country_of_residence, address_line1, address_line2, city, region, postal_code',
    )
    .eq('id', user.id)
    .single()

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Your profile</h1>
        <p className="text-muted-foreground mt-1">
          A fictional demo profile — this information stays inside the demo environment.
        </p>
      </div>
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal details</CardTitle>
          <CardDescription>Required before you can submit KYC verification.</CardDescription>
        </CardHeader>
        <CardContent>
          <ProfileForm
            defaultValues={{
              firstName: profile?.first_name ?? '',
              lastName: profile?.last_name ?? '',
              dateOfBirth: profile?.date_of_birth ?? '',
              phoneNumber: profile?.phone_number ?? '',
              countryOfResidence: profile?.country_of_residence ?? '',
              addressLine1: profile?.address_line1 ?? '',
              addressLine2: profile?.address_line2 ?? '',
              city: profile?.city ?? '',
              region: profile?.region ?? '',
              postalCode: profile?.postal_code ?? '',
            }}
          />
        </CardContent>
      </Card>
    </div>
  )
}
