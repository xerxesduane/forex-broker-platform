/**
 * Deterministic demo-data seed. Safe to run against a freshly-migrated,
 * empty database (`npm run db:seed`); NOT idempotent against a database
 * that already has demo data — use `npm run db:reset-demo` to wipe and
 * reseed. See docs/product-plan.md "Demonstration data" and
 * docs/assumptions.md for what's modeled and why.
 */
import { randomInt, randomUUID } from 'node:crypto'
import { createAdminClient } from './lib/admin-client'
import { CLIENT_SEED, DEMO_PASSWORD, STAFF_SEED } from './lib/identities'

const admin = createAdminClient()

type AuditInput = {
  actorId: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  reason?: string
  beforeState?: unknown
  afterState?: unknown
}

async function logAudit(event: AuditInput) {
  const { error } = await admin.from('audit_events').insert({
    actor_id: event.actorId,
    actor_role: event.actorRole,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    reason: event.reason,
    correlation_id: randomUUID(),
    before_state: event.beforeState ?? null,
    after_state: event.afterState ?? null,
  })
  if (error) throw new Error(`audit insert failed for ${event.action}: ${error.message}`)
}

async function createAuthUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: DEMO_PASSWORD,
    email_confirm: true,
  })
  if (error || !data.user) throw new Error(`Failed to create ${email}: ${error?.message}`)
  return data.user.id
}

function fakeMt5Login() {
  return Number(`9${randomInt(100_000, 999_999)}`)
}

async function seedStaff() {
  console.log('Seeding staff…')
  const { data: roles, error: rolesError } = await admin.from('roles').select('id, key')
  if (rolesError || !roles) throw new Error(`Could not load roles: ${rolesError?.message}`)
  const roleIdByKey = new Map(roles.map((r) => [r.key as string, r.id as string]))

  const staffIdByRole = new Map<string, string>()

  for (const staff of STAFF_SEED) {
    const userId = await createAuthUser(staff.email)
    await admin
      .from('profiles')
      .update({ account_kind: 'staff', first_name: staff.firstName, last_name: staff.lastName })
      .eq('id', userId)

    const roleId = roleIdByKey.get(staff.roleKey)
    if (!roleId) throw new Error(`Unknown role key ${staff.roleKey}`)

    await admin.from('staff_role_assignments').insert({ profile_id: userId, role_id: roleId })
    staffIdByRole.set(staff.roleKey, userId)

    await logAudit({
      actorId: userId,
      actorRole: 'system',
      action: 'staff.seeded',
      entityType: 'profile',
      entityId: userId,
      afterState: { role: staff.roleKey },
    })
  }

  return staffIdByRole
}

async function seedClients(staffIdByRole: Map<string, string>) {
  console.log('Seeding clients…')
  const analystId = staffIdByRole.get('kyc_analyst')
  if (!analystId) throw new Error('KYC analyst not seeded')

  const clientIdByEmail = new Map<string, string>()

  for (const client of CLIENT_SEED) {
    const userId = await createAuthUser(client.email)
    clientIdByEmail.set(client.email, userId)

    if (client.kycState !== 'not_started') {
      await admin
        .from('profiles')
        .update({
          first_name: client.firstName,
          last_name: client.lastName,
          date_of_birth: '1990-06-12',
          phone_number: '+1 555 010 0100',
          country_of_residence: client.country,
          address_line1: '12 Demo Lane',
          city: 'Springfield',
          postal_code: '00000',
          profile_completed_at: new Date().toISOString(),
        })
        .eq('id', userId)

      await logAudit({
        actorId: userId,
        actorRole: 'client',
        action: 'profile.complete',
        entityType: 'profile',
        entityId: userId,
      })
    }

    if (client.kycState === 'not_started') continue

    const { data: kycCase, error: kycError } = await admin
      .from('kyc_cases')
      .insert({
        client_id: userId,
        employment_status: 'employed',
        source_of_funds: 'salary',
        declared_country: client.country,
      })
      .select('id')
      .single()
    if (kycError || !kycCase)
      throw new Error(`kyc insert failed for ${client.email}: ${kycError?.message}`)

    await logAudit({
      actorId: userId,
      actorRole: 'client',
      action: 'kyc.submit',
      entityType: 'kyc_case',
      entityId: kycCase.id,
      afterState: { status: 'submitted' },
    })

    if (client.kycState === 'in_review') {
      await admin.from('kyc_cases').update({ status: 'in_review' }).eq('id', kycCase.id)
      await logAudit({
        actorId: analystId,
        actorRole: 'kyc_analyst',
        action: 'kyc.review_started',
        entityType: 'kyc_case',
        entityId: kycCase.id,
        beforeState: { status: 'submitted' },
        afterState: { status: 'in_review' },
      })
      continue
    }

    const decision = client.kycState === 'approved' ? 'approved' : 'rejected'
    const reason =
      decision === 'approved'
        ? 'Identity document and address match declared profile.'
        : 'Proof of address document was unreadable — please resubmit a clearer scan.'

    await admin
      .from('kyc_cases')
      .update({
        status: decision,
        decided_at: new Date().toISOString(),
        decided_by: analystId,
        decision_reason: reason,
      })
      .eq('id', kycCase.id)

    await logAudit({
      actorId: analystId,
      actorRole: 'kyc_analyst',
      action: 'kyc.decide',
      entityType: 'kyc_case',
      entityId: kycCase.id,
      reason,
      beforeState: { status: 'submitted' },
      afterState: { status: decision },
    })

    await admin.from('notifications').insert({
      profile_id: userId,
      type: decision === 'approved' ? 'kyc_approved' : 'kyc_rejected',
      title: decision === 'approved' ? 'KYC approved' : 'KYC application rejected',
      body:
        decision === 'approved'
          ? 'Your demo KYC application has been approved. You can now request a demo trading account.'
          : `Your demo KYC application was rejected: ${reason}`,
      payload: { kycCaseId: kycCase.id },
    })
  }

  return clientIdByEmail
}

async function seedTradingAccounts(clientIdByEmail: Map<string, string>) {
  console.log('Seeding trading accounts…')
  const samuelId = clientIdByEmail.get('samuel.reyes@demo.aurion-markets.test')
  const imogenId = clientIdByEmail.get('imogen.hale@demo.aurion-markets.test')
  if (!samuelId || !imogenId) throw new Error('Approved demo clients not seeded')

  const provisionedAt = new Date().toISOString()
  const { data: demoAccount, error: demoError } = await admin
    .from('trading_accounts')
    .insert({
      client_id: samuelId,
      account_type: 'demo',
      status: 'active',
      base_currency: 'USD',
      leverage: 100,
      mt5_login: fakeMt5Login(),
      mt5_server: 'AurionMarkets-Demo',
      mt5_group: 'demo\\standard',
      balance: 10_000,
      equity: 10_000,
      free_margin: 10_000,
      provisioned_at: provisionedAt,
      snapshot_synced_at: provisionedAt,
    })
    .select('id, mt5_login')
    .single()
  if (demoError || !demoAccount)
    throw new Error(`demo account insert failed: ${demoError?.message}`)

  await logAudit({
    actorId: samuelId,
    actorRole: 'client',
    action: 'trading_account.request',
    entityType: 'trading_account',
    entityId: demoAccount.id,
    afterState: { status: 'requested', accountType: 'demo' },
  })
  await logAudit({
    actorId: samuelId,
    actorRole: 'system',
    action: 'trading_account.provisioned',
    entityType: 'trading_account',
    entityId: demoAccount.id,
    beforeState: { status: 'provisioning' },
    afterState: { status: 'active', mt5Login: demoAccount.mt5_login },
  })
  await admin.from('notifications').insert({
    profile_id: samuelId,
    type: 'trading_account_provisioned',
    title: 'Demo account ready',
    body: `Your demo MT5 account ${demoAccount.mt5_login} is ready to use.`,
    payload: { tradingAccountId: demoAccount.id },
  })

  // A "real" account example (Phase 3+ flow, not wired) sitting in
  // `requested` — illustrates the account_type distinction from the demo
  // domain requirements without pretending real-account provisioning is
  // implemented in this pass.
  const { data: realAccount } = await admin
    .from('trading_accounts')
    .insert({
      client_id: imogenId,
      account_type: 'real',
      status: 'requested',
      base_currency: 'EUR',
      leverage: 200,
      spread_model: 'raw_plus_commission',
      commission_model: 'per_lot',
    })
    .select('id')
    .single()
  if (realAccount) {
    await logAudit({
      actorId: imogenId,
      actorRole: 'client',
      action: 'trading_account.request',
      entityType: 'trading_account',
      entityId: realAccount.id,
      afterState: { status: 'requested', accountType: 'real' },
    })
  }

  return { demoAccountId: demoAccount.id as string }
}

async function seedFinance(
  clientIdByEmail: Map<string, string>,
  staffIdByRole: Map<string, string>,
) {
  console.log('Seeding wallet, ledger and money-movement examples…')
  const samuelId = clientIdByEmail.get('samuel.reyes@demo.aurion-markets.test')
  const approverId = staffIdByRole.get('finance_approver')
  if (!samuelId || !approverId) throw new Error('Finance seed prerequisites missing')

  const { data: clearingAccount } = await admin
    .from('ledger_accounts')
    .insert({ kind: 'clearing', currency: 'USD', name: 'Demo Payments Clearing (USD)' })
    .select('id')
    .single()

  const { data: walletLedgerAccount } = await admin
    .from('ledger_accounts')
    .insert({
      kind: 'client_wallet',
      owner_id: samuelId,
      currency: 'USD',
      name: 'Samuel Reyes — USD wallet',
    })
    .select('id')
    .single()

  if (!clearingAccount || !walletLedgerAccount) throw new Error('ledger account seed failed')
  const clearingAccountId: string = clearingAccount.id
  const walletLedgerAccountId: string = walletLedgerAccount.id

  const { data: wallet } = await admin
    .from('wallets')
    .insert({ client_id: samuelId, currency: 'USD', ledger_account_id: walletLedgerAccountId })
    .select('id')
    .single()
  if (!wallet) throw new Error('wallet seed failed')

  async function postBalancedTransaction(type: string, amount: number) {
    const { data: transaction } = await admin
      .from('transactions')
      .insert({
        type,
        status: 'posted',
        idempotency_key: randomUUID(),
        posted_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (!transaction) throw new Error('transaction seed failed')

    const isDeposit = type === 'deposit'
    await admin.from('ledger_entries').insert([
      {
        transaction_id: transaction.id,
        ledger_account_id: isDeposit ? clearingAccountId : walletLedgerAccountId,
        direction: 'debit',
        amount,
        currency: 'USD',
      },
      {
        transaction_id: transaction.id,
        ledger_account_id: isDeposit ? walletLedgerAccountId : clearingAccountId,
        direction: 'credit',
        amount,
        currency: 'USD',
      },
    ])
    return transaction.id as string
  }

  const confirmedDepositTxId = await postBalancedTransaction('deposit', 500)
  await admin.from('deposits').insert({
    transaction_id: confirmedDepositTxId,
    client_id: samuelId,
    wallet_id: wallet.id,
    method: 'demo_card',
    provider_ref: `SIM-DEP-${randomUUID()}`,
    amount: 500,
    currency: 'USD',
    status: 'confirmed',
    confirmed_at: new Date().toISOString(),
  })

  const { data: pendingDepositTx } = await admin
    .from('transactions')
    .insert({ type: 'deposit', status: 'pending', idempotency_key: randomUUID() })
    .select('id')
    .single()
  if (pendingDepositTx) {
    await admin.from('deposits').insert({
      transaction_id: pendingDepositTx.id,
      client_id: samuelId,
      wallet_id: wallet.id,
      method: 'demo_bank_transfer',
      provider_ref: `SIM-DEP-${randomUUID()}`,
      amount: 250,
      currency: 'USD',
      status: 'pending',
    })
  }

  const paidWithdrawalTxId = await postBalancedTransaction('withdrawal', 100)
  await admin.from('withdrawals').insert({
    transaction_id: paidWithdrawalTxId,
    client_id: samuelId,
    wallet_id: wallet.id,
    method: 'demo_bank_transfer',
    provider_ref: `SIM-WD-${randomUUID()}`,
    amount: 100,
    currency: 'USD',
    status: 'paid',
    requires_dual_approval: true,
    approved_by: approverId,
    approval_notes: 'Standard verification passed.',
    decided_at: new Date().toISOString(),
  })

  const { data: pendingWithdrawalTx } = await admin
    .from('transactions')
    .insert({ type: 'withdrawal', status: 'pending', idempotency_key: randomUUID() })
    .select('id')
    .single()
  if (pendingWithdrawalTx) {
    await admin.from('withdrawals').insert({
      transaction_id: pendingWithdrawalTx.id,
      client_id: samuelId,
      wallet_id: wallet.id,
      method: 'demo_bank_transfer',
      provider_ref: `SIM-WD-${randomUUID()}`,
      amount: 150,
      currency: 'USD',
      status: 'pending',
      requires_dual_approval: true,
    })
  }

  return { sampleTransactionId: confirmedDepositTxId }
}

async function seedGrowth(clientIdByEmail: Map<string, string>, sampleTransactionId: string) {
  console.log('Seeding referrals, IB, commissions, rebates…')
  const imogenId = clientIdByEmail.get('imogen.hale@demo.aurion-markets.test')
  const jordanId = clientIdByEmail.get('jordan.ellery@demo.aurion-markets.test')
  if (!imogenId || !jordanId) throw new Error('Growth seed prerequisites missing')

  await admin.from('ranks').insert([
    { key: 'associate', name: 'Associate', min_referred_volume: 0, sort_order: 1 },
    { key: 'partner', name: 'Partner', min_referred_volume: 250_000, sort_order: 2 },
    { key: 'elite_partner', name: 'Elite Partner', min_referred_volume: 1_000_000, sort_order: 3 },
  ])
  const { data: associateRank } = await admin
    .from('ranks')
    .select('id')
    .eq('key', 'associate')
    .single()

  const { data: ib } = await admin
    .from('introducing_brokers')
    .insert({ profile_id: imogenId, ib_code: 'IB-IMOGEN01', rank_id: associateRank?.id })
    .select('id')
    .single()
  if (!ib) throw new Error('introducing_broker seed failed')

  await admin.from('referral_relationships').insert({
    referrer_id: imogenId,
    referee_id: jordanId,
    ib_id: ib.id,
  })

  await admin.from('commissions').insert({
    ib_id: ib.id,
    source_transaction_id: sampleTransactionId,
    amount: 15,
    currency: 'USD',
    status: 'approved',
  })

  await admin.from('rebates').insert({
    client_id: jordanId,
    source_transaction_id: sampleTransactionId,
    amount: 5,
    currency: 'USD',
    status: 'pending',
  })
}

async function seedSupport(
  clientIdByEmail: Map<string, string>,
  staffIdByRole: Map<string, string>,
) {
  console.log('Seeding support tickets…')
  const samuelId = clientIdByEmail.get('samuel.reyes@demo.aurion-markets.test')
  const pritiId = clientIdByEmail.get('priti.nakamura@demo.aurion-markets.test')
  const agentId = staffIdByRole.get('support_agent')
  if (!samuelId || !pritiId || !agentId) throw new Error('Support seed prerequisites missing')

  const { data: resolvedTicket } = await admin
    .from('support_tickets')
    .insert({
      client_id: samuelId,
      subject: 'Question about demo account leverage',
      status: 'resolved',
      priority: 'low',
    })
    .select('id')
    .single()
  if (resolvedTicket) {
    await admin.from('support_ticket_messages').insert([
      {
        ticket_id: resolvedTicket.id,
        author_id: samuelId,
        author_role: 'client',
        body: 'Can I change the leverage on my demo account after it is created?',
      },
      {
        ticket_id: resolvedTicket.id,
        author_id: agentId,
        author_role: 'support_agent',
        body: 'Not yet in this demo build — you would request a new demo account with the leverage you want.',
      },
    ])
  }

  const { data: openTicket } = await admin
    .from('support_tickets')
    .insert({
      client_id: pritiId,
      subject: 'How long does KYC review take?',
      status: 'open',
      priority: 'medium',
    })
    .select('id')
    .single()
  if (openTicket) {
    await admin.from('support_ticket_messages').insert({
      ticket_id: openTicket.id,
      author_id: pritiId,
      author_role: 'client',
      body: 'Just checking on the status of my verification — any update?',
    })
  }
}

async function main() {
  const staffIdByRole = await seedStaff()
  const clientIdByEmail = await seedClients(staffIdByRole)
  await seedTradingAccounts(clientIdByEmail)
  const { sampleTransactionId } = await seedFinance(clientIdByEmail, staffIdByRole)
  await seedGrowth(clientIdByEmail, sampleTransactionId)
  await seedSupport(clientIdByEmail, staffIdByRole)

  console.log('\nSeed complete. Demo credentials (password for every account: %s)\n', DEMO_PASSWORD)
  console.log('Staff:')
  for (const s of STAFF_SEED) console.log(`  ${s.roleKey.padEnd(18)} ${s.email}`)
  console.log('Clients:')
  for (const c of CLIENT_SEED) console.log(`  ${c.kycState.padEnd(14)} ${c.email}`)
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
