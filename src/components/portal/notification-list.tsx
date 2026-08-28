'use client'

import { useTransition } from 'react'
import { Bell, BellDot } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { markNotificationRead } from '@/server/notifications'

export type NotificationRow = {
  id: string
  title: string
  body: string
  read_at: string | null
  created_at: string
}

export function NotificationList({ notifications }: { notifications: NotificationRow[] }) {
  const [isPending, startTransition] = useTransition()

  if (notifications.length === 0) {
    return <p className="text-muted-foreground text-sm">No notifications yet.</p>
  }

  return (
    <div className="space-y-3">
      {notifications.map((n) => (
        <Card key={n.id} className={n.read_at ? 'opacity-70' : ''}>
          <CardContent className="flex items-start justify-between gap-4 py-4">
            <div className="flex items-start gap-3">
              {n.read_at ? (
                <Bell className="text-muted-foreground mt-0.5 size-4" aria-hidden="true" />
              ) : (
                <BellDot className="text-accent-foreground mt-0.5 size-4" aria-hidden="true" />
              )}
              <div>
                <p className="font-medium">{n.title}</p>
                <p className="text-muted-foreground text-sm">{n.body}</p>
                <p className="text-muted-foreground mt-1 text-xs">
                  {new Date(n.created_at).toLocaleString()}
                </p>
              </div>
            </div>
            {!n.read_at && (
              <Button
                variant="ghost"
                size="sm"
                disabled={isPending}
                onClick={() => startTransition(() => markNotificationRead(n.id))}
              >
                Mark read
              </Button>
            )}
          </CardContent>
        </Card>
      ))}
    </div>
  )
}
