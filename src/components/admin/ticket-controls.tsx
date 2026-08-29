'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Label } from '@/components/ui/label'
import { updateTicket } from '@/server/support'

export type StaffOption = { id: string; name: string }

/** Status, priority and owner controls on a ticket. Each change is audited. */
export function TicketControls({
  ticketId,
  status,
  priority,
  assignedTo,
  staff,
}: {
  ticketId: string
  status: string
  priority: string
  assignedTo: string | null
  staff: StaffOption[]
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()

  function apply(patch: Record<string, string>) {
    startTransition(async () => {
      const result = await updateTicket({ ticketId, ...patch })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success('Ticket updated.')
      router.refresh()
    })
  }

  const selectClass =
    'border-input bg-background h-9 w-full rounded-md border px-3 text-sm disabled:opacity-60'

  return (
    <div className="space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ticket-status">Status</Label>
        <select
          id="ticket-status"
          className={selectClass}
          value={status}
          disabled={pending}
          onChange={(event) => apply({ status: event.target.value })}
        >
          <option value="open">Open</option>
          <option value="pending">Awaiting client</option>
          <option value="resolved">Resolved</option>
          <option value="closed">Closed</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-priority">Priority</Label>
        <select
          id="ticket-priority"
          className={selectClass}
          value={priority}
          disabled={pending}
          onChange={(event) => apply({ priority: event.target.value })}
        >
          <option value="low">Low</option>
          <option value="medium">Medium</option>
          <option value="high">High</option>
        </select>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="ticket-owner">Assigned to</Label>
        <select
          id="ticket-owner"
          className={selectClass}
          value={assignedTo ?? ''}
          disabled={pending}
          onChange={(event) => apply({ assignedTo: event.target.value })}
        >
          <option value="">Unassigned</option>
          {staff.map((member) => (
            <option key={member.id} value={member.id}>
              {member.name}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}
