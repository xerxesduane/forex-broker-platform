import { ComingSoon } from '@/components/coming-soon'

export default function SupportPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Support</h1>
      <ComingSoon
        title="Support tickets"
        phase="Phase 5 — Growth & service"
        body="Ticket and ticket-message tables exist in the schema with RLS in place. The ticket creation/reply UI is not wired in this pass."
      />
    </div>
  )
}
