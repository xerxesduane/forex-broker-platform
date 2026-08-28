import { NotificationList } from '@/components/portal/notification-list'
import { getCurrentProfile } from '@/lib/auth/current-user'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient()
  const profile = await getCurrentProfile(supabase)
  if (!profile) return null

  const { data: notifications } = await supabase
    .from('notifications')
    .select('id, title, body, read_at, created_at')
    .eq('profile_id', profile.id)
    .order('created_at', { ascending: false })
    .limit(50)

  return (
    <div className="max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Notifications</h1>
        <p className="text-muted-foreground mt-1">Updates about your verification and accounts.</p>
      </div>
      <NotificationList notifications={notifications ?? []} />
    </div>
  )
}
