'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, Send } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'
import { cn } from '@/lib/utils'
import { replyToTicket } from '@/server/support'

export type ThreadMessage = {
  id: string
  body: string
  authorRole: string
  authorName: string
  createdAt: string
  fromClient: boolean
}

/**
 * Shared conversation view. Used by both the admin inbox and the client
 * portal, so the two sides can never drift into showing different
 * histories of the same ticket.
 */
export function TicketThread({
  ticketId,
  messages,
  canReply,
  placeholder,
}: {
  ticketId: string
  messages: ThreadMessage[]
  canReply: boolean
  placeholder?: string
}) {
  const router = useRouter()
  const [body, setBody] = useState('')
  const [pending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result = await replyToTicket({ ticketId, body: body.trim() })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBody('')
      toast.success('Reply sent.')
      router.refresh()
    })
  }

  return (
    <div className="space-y-4">
      <ol className="space-y-3">
        {messages.map((message) => (
          <li
            key={message.id}
            className={cn(
              'rounded-lg border p-3',
              message.fromClient ? 'bg-background' : 'bg-secondary/40',
            )}
          >
            <div className="mb-1.5 flex flex-wrap items-center gap-2">
              <span className="text-sm font-medium">{message.authorName}</span>
              <Badge variant="outline" className="text-[10px] capitalize">
                {message.fromClient ? 'Client' : message.authorRole.replace(/_/g, ' ')}
              </Badge>
              <span className="text-muted-foreground text-xs">
                {new Date(message.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="text-sm whitespace-pre-wrap">{message.body}</p>
          </li>
        ))}
      </ol>

      {canReply ? (
        <div className="space-y-2">
          <Textarea
            value={body}
            onChange={(event) => setBody(event.target.value)}
            rows={4}
            placeholder={placeholder ?? 'Write a reply…'}
          />
          <div className="flex justify-end">
            <Button onClick={submit} disabled={pending || body.trim().length < 2}>
              {pending ? (
                <Loader2 className="mr-1 size-3.5 animate-spin" />
              ) : (
                <Send className="mr-1 size-3.5" aria-hidden="true" />
              )}
              Send reply
            </Button>
          </div>
        </div>
      ) : (
        <p className="text-muted-foreground text-sm">
          This ticket is closed. Reopen it to continue the conversation.
        </p>
      )}
    </div>
  )
}
