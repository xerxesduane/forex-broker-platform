import { ComingSoon } from '@/components/coming-soon'

export default function WalletPage() {
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Wallet</h1>
      <ComingSoon
        title="Wallet, deposits, withdrawals and transfers"
        phase="Phase 4 — Deposits & withdrawals"
        body="The ledger, wallet and money-movement schema already exist (immutable double-entry, ADR 0003), but the deposit/withdrawal/transfer UI and simulated payment-provider flow are not wired in this pass."
      />
    </div>
  )
}
