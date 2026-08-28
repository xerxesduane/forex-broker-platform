/**
 * Destructive demo-data reset: wipes every row this seed process could
 * have created (and, in this demo-only database, everything else too —
 * see the guard below) and reseeds. Requires ALLOW_DEMO_DATA_RESET=true
 * so it can never run by accident against a database someone forgot to
 * flag as demo-only. See docs/product-plan.md "Demonstration data".
 */
import { createAdminClient } from './lib/admin-client'

const admin = createAdminClient()

const TABLES_IN_DELETE_ORDER = [
  'support_ticket_messages',
  'support_tickets',
  'commissions',
  'rebates',
  'referral_relationships',
  'introducing_brokers',
  'ranks',
  'internal_transfers',
  'withdrawals',
  'deposits',
  'ledger_entries',
  'transactions',
  'wallets',
  'ledger_accounts',
  'notifications',
  'integration_events',
  'audit_events',
  'kyc_documents',
  'kyc_cases',
  'trading_accounts',
  'staff_role_assignments',
]

async function deleteAllRows(table: string) {
  const { error } = await admin.from(table).delete().not('id', 'is', null)
  if (error) throw new Error(`Failed to clear ${table}: ${error.message}`)
  console.log(`Cleared ${table}`)
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

  console.log('\nReset complete. Reseeding…\n')
  await import('./seed')
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
