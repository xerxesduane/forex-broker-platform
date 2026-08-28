import { ComingSoon } from '@/components/coming-soon'
import { PERMISSIONS } from '@/domain/rbac/permissions'
import { requirePermission } from '@/lib/rbac/require-permission'
import { createSupabaseServerClient } from '@/lib/supabase/server'

export default async function AdminLedgerPage() {
  const supabase = await createSupabaseServerClient()
  await requirePermission(supabase, PERMISSIONS.LEDGER_VIEW)

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Wallets &amp; ledger</h1>
      <ComingSoon
        title="Ledger, transactions, deposits and withdrawals"
        phase="Phase 3–4 — Accounts, wallets & ledger / Deposits & withdrawals"
        body="The immutable double-entry schema (ADR 0003) is live and RLS-protected, but no application code posts to it yet, and the reconciliation/search UI is not built in this pass."
      />
    </div>
  )
}
