'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessageSquarePlus } from 'lucide-react'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { TICKET_CATEGORIES } from '@/domain/support/state-machine'
import { closeOwnTicket, createSupportTicket } from '@/server/support'

export function NewTicketDialog() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [pending, startTransition] = useTransition()
  const [form, setForm] = useState({
    subject: '',
    category: 'general',
    priority: 'medium',
    body: '',
  })

  const selectClass = 'border-input bg-background h-9 w-full rounded-md border px-3 text-sm'

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger
        render={
          <Button>
            <MessageSquarePlus className="mr-1 size-4" aria-hidden="true" />
            New ticket
          </Button>
        }
      />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Open a support ticket</DialogTitle>
          <DialogDescription>
            Our team sees this immediately, with your account context attached.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ticket-subject">Subject</Label>
            <Input
              id="ticket-subject"
              value={form.subject}
              onChange={(event) => setForm({ ...form, subject: event.target.value })}
              placeholder="Briefly, what do you need?"
            />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ticket-category">Category</Label>
              <select
                id="ticket-category"
                className={selectClass}
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
              >
                {TICKET_CATEGORIES.map((category) => (
                  <option key={category.key} value={category.key}>
                    {category.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ticket-priority">Priority</Label>
              <select
                id="ticket-priority"
                className={selectClass}
                value={form.priority}
                onChange={(event) => setForm({ ...form, priority: event.target.value })}
              >
                <option value="low">Low — no rush</option>
                <option value="medium">Medium</option>
                <option value="high">High — blocking me</option>
              </select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ticket-body">Message</Label>
            <Textarea
              id="ticket-body"
              rows={5}
              value={form.body}
              onChange={(event) => setForm({ ...form, body: event.target.value })}
              placeholder="Tell us what happened, and what you expected instead."
            />
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Cancel</Button>} />
          <Button
            disabled={pending || form.subject.trim().length < 6 || form.body.trim().length < 20}
            onClick={() =>
              startTransition(async () => {
                const result = await createSupportTicket({
                  subject: form.subject.trim(),
                  category: form.category,
                  priority: form.priority,
                  body: form.body.trim(),
                })
                if (!result.ok) {
                  toast.error(result.error)
                  return
                }
                toast.success(`Ticket ${result.value?.reference ?? ''} opened.`)
                setOpen(false)
                setForm({ subject: '', category: 'general', priority: 'medium', body: '' })
                router.refresh()
              })
            }
          >
            {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
            Open ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

export function CloseTicketButton({ ticketId }: { ticketId: string }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  return (
    <Button
      size="sm"
      variant="outline"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await closeOwnTicket(ticketId)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          toast.success('Ticket closed. You can reopen it any time.')
          router.refresh()
        })
      }
    >
      {pending ? <Loader2 className="mr-1 size-3.5 animate-spin" /> : null}
      Close ticket
    </Button>
  )
}
