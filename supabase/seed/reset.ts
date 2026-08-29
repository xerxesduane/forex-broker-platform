/**
 * Destructive demo-data reset: wipes every row this seed process could
 * have created (and, in this demo-only database, everything else too —
 * see the guard below) and reseeds. Requires ALLOW_DEMO_DATA_RESET=true
 * so it can never run by accident against a database someone forgot to
 * flag as demo-only. See docs/product-plan.md "Demonstration data".
 */
import { createAdminClient } from './lib/admin-client'

const admin = createAdminClient()

/**
 * Child rows first, so foreign keys never block the wipe.
 *
 * ledger_entries and audit_events are deliberately absent: both are
 * append-only at the database level (a trigger raises on UPDATE and
 * DELETE), and this script must not be able to quietly punch a hole in
 * that guarantee. They are cleared instead by deleting the auth users
 * they hang off, which cascades — see deleteAllAuthUsers below — with the
 * system-owned ledger rows removed by truncate in clearLedger().
 */
const TABLES_IN_DELETE_ORDER = [
  'support_ticket_messages',
  'support_tickets',
  'client_notes',
  'commissions',
  'rebates',
  'referral_relationships',
  'introducing_brokers',
  'commission_rules',
  'withdrawal_approvals',
  'internal_transfers',
  'withdrawals',
  'deposits',
  'notifications',
  'login_events',
  'user_mfa',
  'integration_events',
  'kyc_documents',
  'kyc_cases',
  'trading_accounts',
  'staff_role_assignments',
]

async function deleteAllRows(table: string) {
  // user_mfa is keyed by profile_id rather than id.
  const keyColumn = table === 'user_mfa' ? 'profile_id' : 'id'
  const { error } = await admin.from(table).delete().not(keyColumn, 'is', null)
  if (error) throw new Error(`Failed to clear ${table}: ${error.message}`)
  console.log(`Cleared ${table}`)
}

/**
 * Clears the append-only tables and the ledger scaffolding the only way
 * the schema permits: TRUNCATE, run through a one-shot security-definer
 * function, rather than by granting DELETE that would weaken the
 * append-only guarantee for everything else. The system ledger accounts
 * are re-created afterwards exactly as the migration created them.
 */
async function clearLedger() {
  const { error } = await admin.rpc('reset_demo_ledger', {
    p_confirmation: 'ERASE-DEMO-LEDGER',
  })
  if (error) {
    throw new Error(
      `Failed to clear the ledger: ${error.message}. ` +
        'Run the migrations first — reset_demo_ledger() ships with them.',
    )
  }
  console.log('Cleared ledger, transactions, wallets and audit history')
}

async function deleteAllAuthUsers() {
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 })
  if (error) throw new Error(`Failed to list auth users: ${error.message}`)
  for (const user of data.users) {
    await admin.auth.admin.deleteUser(user.id)
  }
  console.log(`Deleted ${data.users.length} auth users (profiles cascade)`)
}

async function clearKycDocumentsBucket() {
  const { data, error } = await admin.storage.from('kyc-documents').list()
  if (error || !data) return
  for (const entry of data) {
    const { data: nested } = await admin.storage.from('kyc-documents').list(entry.name)
    const paths = (nested ?? []).map((f) => `${entry.name}/${f.name}`)
    if (paths.length > 0) await admin.storage.from('kyc-documents').remove(paths)
  }
}

async function main() {
  if (process.env.ALLOW_DEMO_DATA_RESET !== 'true') {
    console.error('Refusing to reset: set ALLOW_DEMO_DATA_RESET=true in .env.local to confirm.')
    process.exit(1)
  }

  console.log('Resetting demo data…')
  for (const table of TABLES_IN_DELETE_ORDER) {
    await deleteAllRows(table)
  }
  await clearKycDocumentsBucket()
  await deleteAllAuthUsers()
  await clearLedger()

  console.log('\nReset complete. Reseeding…\n')
  await import('./seed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
