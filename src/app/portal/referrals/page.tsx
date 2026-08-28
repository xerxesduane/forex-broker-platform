import { ComingSoon } from '@/components/coming-soon'

export default function ReferralsPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Referrals &amp; rewards</h1>
      <ComingSoon
        title="Referral link, network, commissions and ranks"
        phase="Phase 5 — Growth & service"
        body="Referral relationships, Introducing Broker, commission and rank tables exist in the schema. The referral-link UI, network view and commission ledger are not wired in this pass."
      />
    </div>
  )
}
