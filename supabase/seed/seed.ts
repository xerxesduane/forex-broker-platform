/**
 * Deterministic demo-data seed.
 *
 * Safe to run against a freshly-migrated, empty database
 * (`npm run db:seed`); NOT idempotent against a database that already has
 * demo data — use `npm run db:reset-demo` to wipe and reseed.
 *
 * Two rules this script deliberately obeys, because they are the rules the
 * platform is built on:
 *
 *   1. It never inserts into ledger_entries. Every posting goes through
 *      post_transaction(), exactly as the application does — so if the
 *      seed produces a balanced trial balance, that is evidence about the
 *      gateway, not about the seed.
 *   2. Every identity is fictional, on a reserved non-resolvable domain.
 *      No real personal data appears anywhere, even as a placeholder.
 *
 * See docs/product-plan.md "Demonstration data" and docs/assumptions.md.
 */
import { randomInt, randomUUID } from 'node:crypto'
import {
  buildCommissionPayoutPosting,
  buildDepositPosting,
  buildInternalTransferPosting,
  buildRebatePosting,
  buildWithdrawalPayoutPosting,
  buildWithdrawalReservationPosting,
  type Posting,
} from '@/domain/ledger/posting'
import { fromMajorUnits } from '@/domain/shared/money'
import { createAdminClient } from './lib/admin-client'
import {
  CLIENT_SEED,
  DEMO_ADDRESSES,
  DEMO_PASSWORD,
  STAFF_SEED,
  type ClientSeed,
} from './lib/identities'

const admin = createAdminClient()

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

type AuditInput = {
  actorId: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  reason?: string
  beforeState?: unknown
  afterState?: unknown
  at?: Date
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
    created_at: (event.at ?? new Date()).toISOString(),
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

function daysAgo(days: number, hour = 10): Date {
  const date = new Date()
  date.setUTCDate(date.getUTCDate() - days)
  date.setUTCHours(hour, randomInt(0, 59), randomInt(0, 59), 0)
  return date
}

function monthsAgo(months: number, dayOffset = 0): Date {
  return daysAgo(months * 30 + dayOffset)
}

function demoMt5Login(prefix: '8' | '9') {
  return Number(`${prefix}${randomInt(100_000, 999_999)}`)
}

function reference(prefix: string) {
  return `${prefix}-${randomUUID().slice(0, 8).toUpperCase()}`
}

const usd = (amount: number) => fromMajorUnits(amount, 'USD')

/**
 * Post a `Posting` produced by the domain builders.
 *
 * The seed used to spell its legs out by hand, which is exactly how two
 * postings came to describe the wrong economics while still balancing:
 * the builders were corrected and this file kept its own stale copy. Now
 * there is one definition of each movement's shape, and the seed exercises
 * the same code the server actions do.
 */
async function post(input: {
  type: string
  built: ReturnType<typeof buildDepositPosting>
  externalRef: string
  occurredAt: Date
}): Promise<string> {
  if (!input.built.ok) {
    throw new Error(`Posting rejected (${input.externalRef}): ${input.built.error.message}`)
  }
  const posting: Posting = input.built.value
  return postTransaction({
    type: input.type,
    currency: posting.currency,
    legs: posting.legs,
    externalRef: input.externalRef,
    occurredAt: input.occurredAt,
  })
}

/** The only path into the ledger — same gateway the application uses. */
async function postTransaction(input: {
  type: string
  currency: string
  legs: { ledgerAccountId: string; direction: 'debit' | 'credit'; amount: number }[]
  externalRef: string
  occurredAt: Date
  idempotencyKey?: string
}): Promise<string> {
  const { data, error } = await admin.rpc('post_transaction', {
    p_type: input.type,
    p_currency: input.currency,
    p_idempotency_key: input.idempotencyKey ?? randomUUID(),
    p_legs: input.legs.map((leg) => ({
      ledger_account_id: leg.ledgerAccountId,
      direction: leg.direction,
      amount: leg.amount,
    })),
    p_external_ref: input.externalRef,
    p_occurred_at: input.occurredAt.toISOString(),
  })
  if (error || typeof data !== 'string') {
    throw new Error(`post_transaction failed (${input.externalRef}): ${error?.message}`)
  }
  return data
}

type SystemAccounts = {
  houseBank: string
  clearingDeposits: string
  clearingWithdrawals: string
  feeIncome: string
  brokerExpense: string
}

async function loadSystemAccounts(): Promise<SystemAccounts> {
  const { data, error } = await admin
    .from('ledger_accounts')
    .select('id, key')
    .not('key', 'is', null)
  if (error) throw new Error(`Could not load system ledger accounts: ${error.message}`)

  const byKey = new Map((data ?? []).map((row) => [row.key as string, row.id as string]))
  const required = {
    houseBank: 'house_bank_usd',
    clearingDeposits: 'clearing_deposits_usd',
    clearingWithdrawals: 'clearing_withdrawals_usd',
    feeIncome: 'fee_income_usd',
    brokerExpense: 'broker_expense_usd',
  } as const

  const resolved: Partial<SystemAccounts> = {}
  for (const [field, key] of Object.entries(required)) {
    const id = byKey.get(key)
    if (!id) throw new Error(`System ledger account "${key}" missing — run migrations first.`)
    resolved[field as keyof SystemAccounts] = id
  }
  return resolved as SystemAccounts
}

type SeededClient = {
  seed: ClientSeed
  id: string
  walletId: string
  ledgerAccountId: string
  referralCode: string
}

// ---------------------------------------------------------------------------
// Staff
// ---------------------------------------------------------------------------

async function seedStaff() {
  console.log('Seeding staff…')
  const { data: roles, error: rolesError } = await admin.from('roles').select('id, key')
  if (rolesError || !roles) throw new Error(`Could not load roles: ${rolesError?.message}`)
  const roleIdByKey = new Map(roles.map((r) => [r.key as string, r.id as string]))

  const staffIdByRole = new Map<string, string>()
  const staffIdByEmail = new Map<string, string>()

  for (const staff of STAFF_SEED) {
    const userId = await createAuthUser(staff.email)
    await admin
      .from('profiles')
      .update({
        account_kind: 'staff',
        first_name: staff.firstName,
        last_name: staff.lastName,
        last_login_at: daysAgo(randomInt(0, 3)).toISOString(),
      })
      .eq('id', userId)

    const roleId = roleIdByKey.get(staff.roleKey)
    if (!roleId) throw new Error(`Unknown role key ${staff.roleKey}`)

    await admin.from('staff_role_assignments').insert({ profile_id: userId, role_id: roleId })

    // First holder of a role wins the lookup, so the second finance
    // approver stays addressable by email for the maker-checker demo.
    if (!staffIdByRole.has(staff.roleKey)) staffIdByRole.set(staff.roleKey, userId)
    staffIdByEmail.set(staff.email, userId)

    await logAudit({
      actorId: userId,
      actorRole: 'system',
      action: 'staff.seeded',
      entityType: 'profile',
      entityId: userId,
      afterState: { role: staff.roleKey, title: staff.title },
      at: monthsAgo(12),
    })

    await admin.from('login_events').insert({
      profile_id: userId,
      email: staff.email,
      kind: 'sign_in',
      user_agent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Chrome/141.0',
      location_label: 'Aurion Markets office network',
      created_at: daysAgo(randomInt(0, 3)).toISOString(),
    })
  }

  return { staffIdByRole, staffIdByEmail }
}

// ---------------------------------------------------------------------------
// Clients, profiles and KYC
// ---------------------------------------------------------------------------

async function seedClients(staffIdByRole: Map<string, string>) {
  console.log('Seeding clients and KYC cases…')
  const analystId = staffIdByRole.get('kyc_analyst')
  if (!analystId) throw new Error('KYC analyst not seeded')

  const clients = new Map<string, SeededClient>()

  for (const [index, seed] of CLIENT_SEED.entries()) {
    const userId = await createAuthUser(seed.email)
    const joinedAt = monthsAgo(seed.joinedMonthsAgo, randomInt(0, 20))
    const address = DEMO_ADDRESSES[index % DEMO_ADDRESSES.length]!

    const profileUpdate: Record<string, unknown> = {
      created_at: joinedAt.toISOString(),
      account_status: seed.accountStatus ?? 'active',
      risk_rating: seed.riskRating ?? 'low',
      last_login_at: daysAgo(randomInt(0, 20)).toISOString(),
    }

    if (seed.kycState !== 'not_started') {
      Object.assign(profileUpdate, {
        first_name: seed.firstName,
        last_name: seed.lastName,
        date_of_birth: `19${randomInt(70, 99)}-0${randomInt(1, 9)}-1${randomInt(0, 9)}`,
        phone_number: `+1 555 01${String(randomInt(10, 99))} ${String(randomInt(100, 999))}`,
        country_of_residence: seed.country,
        address_line1: address.line1,
        city: seed.city,
        postal_code: address.postal,
        profile_completed_at: new Date(joinedAt.getTime() + 3_600_000).toISOString(),
      })
    } else {
      // A registered-but-unstarted client still has a name on file.
      Object.assign(profileUpdate, { first_name: seed.firstName, last_name: seed.lastName })
    }

    await admin.from('profiles').update(profileUpdate).eq('id', userId)

    const { data: profileRow } = await admin
      .from('profiles')
      .select('referral_code')
      .eq('id', userId)
      .single()

    // The wallet is created by a database trigger on profile insert, so
    // this reads back what the schema already guaranteed.
    const { data: walletRow } = await admin
      .from('wallets')
      .select('id, ledger_account_id')
      .eq('client_id', userId)
      .eq('currency', 'USD')
      .single()

    if (!walletRow) throw new Error(`Wallet was not auto-created for ${seed.email}`)

    clients.set(seed.email, {
      seed,
      id: userId,
      walletId: walletRow.id as string,
      ledgerAccountId: walletRow.ledger_account_id as string,
      referralCode: (profileRow?.referral_code as string) ?? '',
    })

    await logAudit({
      actorId: userId,
      actorRole: 'client',
      action: 'client.registered',
      entityType: 'profile',
      entityId: userId,
      afterState: { email: seed.email, country: seed.country },
      at: joinedAt,
    })

    await admin.from('login_events').insert({
      profile_id: userId,
      email: seed.email,
      kind: 'sign_in',
      user_agent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_2) Safari/605.1',
      created_at: daysAgo(randomInt(0, 20)).toISOString(),
    })

    if (seed.kycState === 'not_started') continue

    // --- KYC case ---------------------------------------------------------
    const submittedAt = new Date(joinedAt.getTime() + 2 * 86_400_000)
    const { data: kycCase, error: kycError } = await admin
      .from('kyc_cases')
      .insert({
        client_id: userId,
        employment_status: ['employed', 'self_employed', 'retired'][randomInt(0, 2)],
        source_of_funds: ['salary', 'business_income', 'investments'][randomInt(0, 2)],
        declared_country: seed.country,
        submitted_at: submittedAt.toISOString(),
        created_at: submittedAt.toISOString(),
      })
      .select('id')
      .single()
    if (kycError || !kycCase) {
      throw new Error(`kyc insert failed for ${seed.email}: ${kycError?.message}`)
    }

    await admin.from('kyc_documents').insert([
      {
        kyc_case_id: kycCase.id,
        doc_type: 'identity_document',
        storage_path: `${userId}/${randomUUID()}-passport.txt`,
        original_filename: 'demo-passport-placeholder.txt',
        content_type: 'text/plain',
        size_bytes: randomInt(40_000, 240_000),
        uploaded_at: submittedAt.toISOString(),
        review_status: seed.kycState === 'approved' ? 'accepted' : 'pending',
      },
      {
        kyc_case_id: kycCase.id,
        doc_type: 'proof_of_address',
        storage_path: `${userId}/${randomUUID()}-address.txt`,
        original_filename: 'demo-utility-bill-placeholder.txt',
        content_type: 'text/plain',
        size_bytes: randomInt(20_000, 120_000),
        uploaded_at: submittedAt.toISOString(),
        review_status:
          seed.kycState === 'approved'
            ? 'accepted'
            : seed.kycState === 'needs_revision'
              ? 'rejected'
              : 'pending',
        review_note:
          seed.kycState === 'needs_revision'
            ? 'Statement is older than three months — a recent one is needed.'
            : null,
      },
    ])

    await logAudit({
      actorId: userId,
      actorRole: 'client',
      action: 'kyc.submit',
      entityType: 'kyc_case',
      entityId: kycCase.id,
      afterState: { status: 'submitted' },
      at: submittedAt,
    })

    if (seed.kycState === 'submitted') continue

    // Everything past 'submitted' has been picked up by an analyst.
    const claimedAt = new Date(submittedAt.getTime() + 86_400_000)
    await admin
      .from('kyc_cases')
      .update({ status: 'in_review', analyst_id: analystId, claimed_at: claimedAt.toISOString() })
      .eq('id', kycCase.id)

    await logAudit({
      actorId: analystId,
      actorRole: 'kyc_analyst',
      action: 'kyc.claimed',
      entityType: 'kyc_case',
      entityId: kycCase.id,
      beforeState: { status: 'submitted' },
      afterState: { status: 'in_review', analystId },
      at: claimedAt,
    })

    if (seed.kycState === 'in_review') continue

    const decidedAt = new Date(claimedAt.getTime() + 86_400_000)

    if (seed.kycState === 'needs_revision') {
      const reason =
        'Your proof of address is more than three months old. Please upload a recent statement.'
      await admin
        .from('kyc_cases')
        .update({ status: 'needs_revision', decision_reason: reason })
        .eq('id', kycCase.id)
      await logAudit({
        actorId: analystId,
        actorRole: 'kyc_analyst',
        action: 'kyc.revision_requested',
        entityType: 'kyc_case',
        entityId: kycCase.id,
        reason,
        beforeState: { status: 'in_review' },
        afterState: { status: 'needs_revision' },
        at: decidedAt,
      })
      await admin.from('notifications').insert({
        profile_id: userId,
        type: 'kyc_needs_revision',
        title: 'More information needed',
        body: `Our compliance team needs something else before approving your verification: ${reason}`,
        payload: { kycCaseId: kycCase.id },
        created_at: decidedAt.toISOString(),
      })
      continue
    }

    const approved = seed.kycState === 'approved'
    const reason = approved
      ? 'Identity document and proof of address match the declared profile.'
      : 'Identity document could not be matched to the declared name after two attempts.'

    await admin
      .from('kyc_cases')
      .update({
        status: approved ? 'approved' : 'rejected',
        decided_at: decidedAt.toISOString(),
        decided_by: analystId,
        decision_reason: reason,
        risk_flags: seed.riskRating === 'high' ? ['high_risk_jurisdiction'] : [],
      })
      .eq('id', kycCase.id)

    await logAudit({
      actorId: analystId,
      actorRole: 'kyc_analyst',
      action: 'kyc.decide',
      entityType: 'kyc_case',
      entityId: kycCase.id,
      reason,
      beforeState: { status: 'in_review' },
      afterState: { status: approved ? 'approved' : 'rejected' },
      at: decidedAt,
    })

    await admin.from('notifications').insert({
      profile_id: userId,
      type: approved ? 'kyc_approved' : 'kyc_rejected',
      title: approved ? 'Verification complete' : 'We could not verify your account',
      body: approved
        ? 'Your identity verification has been approved. You can now fund your account and open a live trading account.'
        : `Your verification was not approved: ${reason}`,
      payload: { kycCaseId: kycCase.id },
      created_at: decidedAt.toISOString(),
      read_at: approved && seed.joinedMonthsAgo > 2 ? decidedAt.toISOString() : null,
    })
  }

  return clients
}

// ---------------------------------------------------------------------------
// Trading accounts
// ---------------------------------------------------------------------------

async function seedTradingAccounts(
  clients: Map<string, SeededClient>,
  staffIdByRole: Map<string, string>,
) {
  console.log('Seeding trading accounts…')
  const tradingOpsId = staffIdByRole.get('trading_operations')

  for (const client of clients.values()) {
    if (client.seed.kycState !== 'approved') continue

    const openedAt = monthsAgo(Math.max(0, client.seed.joinedMonthsAgo - 1), 5)

    // Every verified client gets a demo account — they provision instantly.
    const demoLogin = demoMt5Login('9')
    const { data: demoAccount } = await admin
      .from('trading_accounts')
      .insert({
        client_id: client.id,
        account_type: 'demo',
        status: 'active',
        base_currency: 'USD',
        leverage: [100, 200, 500][randomInt(0, 2)],
        mt5_login: demoLogin,
        mt5_server: 'AurionMarkets-Demo',
        mt5_group: 'demo\\standard',
        balance: 10_000,
        equity: 10_000,
        free_margin: 10_000,
        requested_at: openedAt.toISOString(),
        provisioned_at: openedAt.toISOString(),
        snapshot_synced_at: openedAt.toISOString(),
      })
      .select('id')
      .single()

    if (demoAccount) {
      await logAudit({
        actorId: client.id,
        actorRole: 'client',
        action: 'trading_account.request',
        entityType: 'trading_account',
        entityId: demoAccount.id,
        afterState: { status: 'requested', accountType: 'demo' },
        at: openedAt,
      })
      await logAudit({
        actorId: client.id,
        actorRole: 'system',
        action: 'trading_account.provisioned',
        entityType: 'trading_account',
        entityId: demoAccount.id,
        beforeState: { status: 'provisioning' },
        afterState: { status: 'active', mt5Login: demoLogin, mt5Server: 'AurionMarkets-Demo' },
        at: openedAt,
      })
    }

    // Funded clients also hold a live account.
    if (client.seed.fundingProfile && client.seed.fundingProfile !== 'none') {
      const raw = client.seed.fundingProfile === 'heavy'
      const liveLogin = demoMt5Login('8')
      const liveOpenedAt = new Date(openedAt.getTime() + 3 * 86_400_000)
      const suspended = client.seed.accountStatus === 'suspended'

      const { data: liveAccount } = await admin
        .from('trading_accounts')
        .insert({
          client_id: client.id,
          account_type: 'real',
          status: suspended ? 'suspended' : 'active',
          base_currency: 'USD',
          leverage: raw ? 200 : 100,
          spread_model: raw ? 'raw_plus_commission' : 'standard',
          commission_model: raw ? 'per_lot' : 'none',
          mt5_login: liveLogin,
          mt5_server: 'AurionMarkets-Live01',
          mt5_group: raw ? 'real\\raw' : 'real\\standard',
          approved_by: tradingOpsId ?? null,
          suspension_reason: suspended ? 'Trading disabled pending source-of-funds review.' : null,
          requested_at: liveOpenedAt.toISOString(),
          provisioned_at: liveOpenedAt.toISOString(),
          snapshot_synced_at: liveOpenedAt.toISOString(),
        })
        .select('id')
        .single()

      if (liveAccount) {
        await logAudit({
          actorId: client.id,
          actorRole: 'client',
          action: 'trading_account.request',
          entityType: 'trading_account',
          entityId: liveAccount.id,
          afterState: { status: 'requested', accountType: 'real', plan: raw ? 'raw' : 'standard' },
          at: liveOpenedAt,
        })
        if (tradingOpsId) {
          await logAudit({
            actorId: tradingOpsId,
            actorRole: 'trading_operations',
            action: 'trading_account.provisioned',
            entityType: 'trading_account',
            entityId: liveAccount.id,
            beforeState: { status: 'provisioning' },
            afterState: { status: 'active', mt5Login: liveLogin },
            at: liveOpenedAt,
          })
        }
        if (suspended) {
          await logAudit({
            actorId: tradingOpsId ?? client.id,
            actorRole: 'trading_operations',
            action: 'trading_account.suspend',
            entityType: 'trading_account',
            entityId: liveAccount.id,
            reason: 'Trading disabled pending source-of-funds review.',
            beforeState: { status: 'active' },
            afterState: { status: 'suspended' },
            at: daysAgo(9),
          })
        }
      }
    }
  }

  // Two live-account requests left in the queue, so trading operations has
  // something to decide during a walkthrough.
  for (const email of [
    'tobias.reinhardt@demo.aurion-markets.test',
    'chiara.rossi@demo.aurion-markets.test',
  ]) {
    const client = clients.get(email)
    if (!client) continue
    const requestedAt = daysAgo(randomInt(1, 4))
    const { data: pendingAccount } = await admin
      .from('trading_accounts')
      .insert({
        client_id: client.id,
        account_type: 'real',
        status: 'requested',
        base_currency: 'EUR',
        leverage: 200,
        spread_model: 'raw_plus_commission',
        commission_model: 'per_lot',
        nickname: 'Swing account',
        requested_at: requestedAt.toISOString(),
      })
      .select('id')
      .single()

    if (pendingAccount) {
      await logAudit({
        actorId: client.id,
        actorRole: 'client',
        action: 'trading_account.request',
        entityType: 'trading_account',
        entityId: pendingAccount.id,
        afterState: { status: 'requested', accountType: 'real', plan: 'raw' },
        at: requestedAt,
      })
    }
  }
}

// ---------------------------------------------------------------------------
// Money movement
//
// Every credited deposit, paid withdrawal, transfer, commission and rebate
// below goes through post_transaction(). Nothing writes ledger_entries
// directly, so the trial balance this produces is evidence that the
// gateway holds, not that the seed was careful.
// ---------------------------------------------------------------------------

const FUNDING_PLAN: Record<string, { count: number; min: number; max: number }> = {
  light: { count: 2, min: 150, max: 900 },
  steady: { count: 5, min: 400, max: 2_400 },
  heavy: { count: 9, min: 900, max: 7_500 },
}

const DEPOSIT_METHOD_KEYS = ['card', 'bank_transfer', 'crypto_usdt', 'skrill'] as const

async function seedMoneyMovement(
  clients: Map<string, SeededClient>,
  staffIdByRole: Map<string, string>,
  staffIdByEmail: Map<string, string>,
  system: SystemAccounts,
) {
  console.log('Seeding deposits, withdrawals and transfers…')
  const operatorId: string | undefined = staffIdByRole.get('finance_operator')
  const approverId: string | undefined = staffIdByRole.get('finance_approver')
  const secondApproverId = staffIdByEmail.get('yuki.tanaka@aurion-markets.example')
  if (!operatorId || !approverId) throw new Error('Finance staff not seeded')
  const financeOperatorId: string = operatorId
  const financeApproverId: string = approverId

  const creditedDeposits: { client: SeededClient; amount: number; at: Date }[] = []

  for (const client of clients.values()) {
    const profile = client.seed.fundingProfile
    if (!profile || profile === 'none' || client.seed.kycState !== 'approved') continue

    const plan = FUNDING_PLAN[profile]!
    const window = Math.max(1, client.seed.joinedMonthsAgo)

    for (let index = 0; index < plan.count; index += 1) {
      const amount = randomInt(plan.min, plan.max)
      const at = daysAgo(randomInt(1, window * 30), randomInt(8, 20))
      const method = DEPOSIT_METHOD_KEYS[randomInt(0, DEPOSIT_METHOD_KEYS.length - 1)]!
      const referenceCode = reference('DEP')

      const transactionId = await post({
        type: 'deposit',
        built: buildDepositPosting({
          clientLedgerAccountId: client.ledgerAccountId,
          system,
          amount: usd(amount),
        }),
        externalRef: referenceCode,
        occurredAt: at,
      })

      const { data: deposit } = await admin
        .from('deposits')
        .insert({
          transaction_id: transactionId,
          client_id: client.id,
          wallet_id: client.walletId,
          method,
          provider_ref: `SIM-DEP-${randomUUID().slice(0, 13).toUpperCase()}`,
          amount,
          currency: 'USD',
          status: 'approved',
          reference_code: referenceCode,
          created_at: at.toISOString(),
          confirmed_at: at.toISOString(),
          reviewed_by: amount > 2_500 ? financeOperatorId : null,
        })
        .select('id')
        .single()

      creditedDeposits.push({ client, amount, at })

      if (deposit) {
        await logAudit({
          actorId: client.id,
          actorRole: 'client',
          action: 'deposit.request',
          entityType: 'deposit',
          entityId: deposit.id,
          afterState: { status: 'pending', amount, method, referenceCode },
          at,
        })
        await logAudit({
          actorId: amount > 2_500 ? financeOperatorId : client.id,
          actorRole: amount > 2_500 ? 'finance_operator' : 'system',
          action: 'deposit.credited',
          entityType: 'deposit',
          entityId: deposit.id,
          reason:
            amount > 2_500
              ? 'Approved by finance after manual review.'
              : 'Auto-credited: at or below the 2500 USD auto-credit limit.',
          beforeState: { status: 'confirmed' },
          afterState: { status: 'approved', transactionId, amount },
          at,
        })
      }
    }
  }

  // --- Deposits currently in the queue -------------------------------------
  const queueCandidates = ['aisha.rahman', 'samuel.reyes', 'freya.lindqvist', 'mateo.silva']
  for (const [index, prefix] of queueCandidates.entries()) {
    const client = [...clients.values()].find((c) => c.seed.email.startsWith(prefix))
    if (!client) continue

    // Two awaiting a finance decision, two still awaiting the provider.
    const confirmed = index < 2
    const amount = confirmed ? randomInt(3_000, 9_000) : randomInt(200, 1_800)
    const at = daysAgo(randomInt(0, 3))
    const referenceCode = reference('DEP')

    const { data: deposit } = await admin
      .from('deposits')
      .insert({
        client_id: client.id,
        wallet_id: client.walletId,
        method: confirmed ? 'bank_transfer' : 'card',
        provider_ref: `SIM-DEP-${randomUUID().slice(0, 13).toUpperCase()}`,
        amount,
        currency: 'USD',
        status: confirmed ? 'confirmed' : 'pending',
        reference_code: referenceCode,
        created_at: at.toISOString(),
        confirmed_at: confirmed ? at.toISOString() : null,
      })
      .select('id')
      .single()

    if (deposit) {
      await logAudit({
        actorId: client.id,
        actorRole: 'client',
        action: 'deposit.request',
        entityType: 'deposit',
        entityId: deposit.id,
        afterState: { status: 'pending', amount, referenceCode },
        at,
      })
    }
  }

  // --- Withdrawals ---------------------------------------------------------
  const fee = 5

  async function seedWithdrawal(options: {
    client: SeededClient
    amount: number
    at: Date
    status: 'pending' | 'approved' | 'paid' | 'rejected'
    approvals?: string[]
  }) {
    const { client, amount, at, status } = options
    const requiresDual = amount >= 5_000
    const net = amount - fee
    const referenceCode = reference('WDL')

    // The reservation posting happens at request time, whatever the
    // outcome — that is what stops a balance being spent twice.
    const reservationId = await post({
      type: 'withdrawal',
      built: buildWithdrawalReservationPosting({
        clientLedgerAccountId: client.ledgerAccountId,
        system,
        grossAmount: usd(amount),
        fee: usd(fee),
      }),
      externalRef: referenceCode,
      occurredAt: at,
    })

    let reversalId: string | null = null
    if (status === 'rejected') {
      const { data, error } = await admin.rpc('reverse_transaction', {
        p_transaction_id: reservationId,
        p_idempotency_key: randomUUID(),
      })
      if (error) throw new Error(`reverse_transaction failed: ${error.message}`)
      reversalId = data as string
    }

    if (status === 'paid') {
      await post({
        type: 'withdrawal',
        built: buildWithdrawalPayoutPosting({ system, netAmount: usd(net) }),
        externalRef: `${referenceCode} payout`,
        occurredAt: new Date(at.getTime() + 86_400_000),
      })
    }

    const { data: withdrawal } = await admin
      .from('withdrawals')
      .insert({
        transaction_id: reservationId,
        client_id: client.id,
        wallet_id: client.walletId,
        method: 'bank_transfer',
        provider_ref: `SIM-WD-${randomUUID().slice(0, 13).toUpperCase()}`,
        amount,
        currency: 'USD',
        fee,
        status,
        requires_dual_approval: requiresDual,
        payout_detail: 'Demo Bank ****4417',
        reference_code: referenceCode,
        approved_by: status === 'pending' ? null : financeApproverId,
        approval_notes:
          status === 'rejected' ? 'Payout name does not match the verified account holder.' : null,
        reversal_transaction_id: reversalId,
        created_at: at.toISOString(),
        decided_at: status === 'pending' ? null : new Date(at.getTime() + 86_400_000).toISOString(),
        paid_at: status === 'paid' ? new Date(at.getTime() + 86_400_000).toISOString() : null,
      })
      .select('id')
      .single()

    if (!withdrawal) return

    await logAudit({
      actorId: client.id,
      actorRole: 'client',
      action: 'withdrawal.request',
      entityType: 'withdrawal',
      entityId: withdrawal.id,
      afterState: {
        status: 'pending',
        amount,
        fee,
        net,
        requiresDualApproval: requiresDual,
        reservationTransactionId: reservationId,
        referenceCode,
      },
      at,
    })

    for (const signerId of options.approvals ?? []) {
      await admin.from('withdrawal_approvals').insert({
        withdrawal_id: withdrawal.id,
        approver_id: signerId,
        decision: status === 'rejected' ? 'reject' : 'approve',
        notes: status === 'rejected' ? 'Name mismatch on payout destination.' : null,
        created_at: new Date(at.getTime() + 43_200_000).toISOString(),
      })
    }

    if (status !== 'pending') {
      await logAudit({
        actorId: financeApproverId,
        actorRole: 'finance_approver',
        action: status === 'rejected' ? 'withdrawal.rejected' : 'withdrawal.approved',
        entityType: 'withdrawal',
        entityId: withdrawal.id,
        reason:
          status === 'rejected'
            ? 'Payout name does not match the verified account holder.'
            : undefined,
        beforeState: { status: 'pending' },
        afterState: { status, reversalTransactionId: reversalId },
        at: new Date(at.getTime() + 86_400_000),
      })
    }
  }

  const withdrawers = [...clients.values()].filter(
    (client) =>
      client.seed.kycState === 'approved' &&
      client.seed.fundingProfile &&
      client.seed.fundingProfile !== 'none',
  )

  for (const client of withdrawers.slice(0, 6)) {
    await seedWithdrawal({
      client,
      amount: randomInt(200, 1_200),
      at: daysAgo(randomInt(20, 120)),
      status: 'paid',
      approvals: [financeApproverId],
    })
  }

  // One rejected withdrawal, so the reversal shows up in the ledger.
  if (withdrawers[0]) {
    await seedWithdrawal({
      client: withdrawers[0],
      amount: 750,
      at: daysAgo(14),
      status: 'rejected',
      approvals: [financeApproverId],
    })
  }

  // One large withdrawal with a single signature, waiting on a second
  // approver — the maker-checker control, live in the queue.
  if (withdrawers[1] && secondApproverId) {
    await seedWithdrawal({
      client: withdrawers[1],
      amount: 6_400,
      at: daysAgo(1),
      status: 'pending',
      approvals: [financeApproverId],
    })
  }

  // Two ordinary withdrawals waiting for a first decision.
  for (const client of withdrawers.slice(2, 4)) {
    await seedWithdrawal({
      client,
      amount: randomInt(300, 1_500),
      at: daysAgo(randomInt(0, 2)),
      status: 'pending',
    })
  }

  // One approved and awaiting payout.
  if (withdrawers[4]) {
    await seedWithdrawal({
      client: withdrawers[4],
      amount: 900,
      at: daysAgo(2),
      status: 'approved',
      approvals: [financeApproverId],
    })
  }

  // --- Internal transfers --------------------------------------------------
  const sender = clients.get('samuel.reyes@demo.aurion-markets.test')
  const recipient = clients.get('mateo.silva@demo.aurion-markets.test')
  if (sender && recipient) {
    const at = daysAgo(11)
    const amount = 250
    const transferId = randomUUID()
    // Read the sender's balance back out of the ledger rather than
    // assuming it — the transfer builder refuses to overdraw a wallet, and
    // that check is worth exercising here too.
    const { data: senderBalance } = await admin
      .from('ledger_account_balances')
      .select('balance')
      .eq('ledger_account_id', sender.ledgerAccountId)
      .single()

    const transactionId = await post({
      type: 'internal_transfer',
      built: buildInternalTransferPosting({
        fromLedgerAccountId: sender.ledgerAccountId,
        toLedgerAccountId: recipient.ledgerAccountId,
        amount: usd(amount),
        availableBalance: usd(Number(senderBalance?.balance ?? 0)),
      }),
      externalRef: `TRF-${transferId.slice(0, 8).toUpperCase()}`,
      occurredAt: at,
    })
    await admin.from('internal_transfers').insert({
      id: transferId,
      transaction_id: transactionId,
      from_wallet_id: sender.walletId,
      to_wallet_id: recipient.walletId,
      amount,
      currency: 'USD',
      initiated_by: sender.id,
      note: 'Splitting the cost of the strategy course',
      created_at: at.toISOString(),
    })
    await logAudit({
      actorId: sender.id,
      actorRole: 'client',
      action: 'internal_transfer.created',
      entityType: 'internal_transfer',
      entityId: transferId,
      afterState: { amount, currency: 'USD', transactionId },
      at,
    })
  }

  return creditedDeposits
}

// ---------------------------------------------------------------------------
// Partners, referrals, commissions and rebates
// ---------------------------------------------------------------------------

async function seedGrowth(
  clients: Map<string, SeededClient>,
  staffIdByRole: Map<string, string>,
  system: SystemAccounts,
  creditedDeposits: { client: SeededClient; amount: number; at: Date }[],
) {
  console.log('Seeding partners, commissions and rebates…')
  const growthId = staffIdByRole.get('marketing_growth')
  if (!growthId) throw new Error('Growth staff not seeded')

  const { data: rankRows } = await admin.from('ranks').select('id, key, min_referred_volume')
  const rankIdByKey = new Map((rankRows ?? []).map((r) => [r.key as string, r.id as string]))

  const ibByEmail = new Map<string, { id: string; commissionBps: number; profileId: string }>()

  for (const client of clients.values()) {
    if (!client.seed.partner) continue
    const appliedAt = monthsAgo(Math.max(1, client.seed.joinedMonthsAgo - 1))

    const { data: ib } = await admin
      .from('introducing_brokers')
      .insert({
        profile_id: client.id,
        ib_code: client.referralCode,
        rank_id: rankIdByKey.get('bronze') ?? null,
        status: client.seed.partner.status,
        commission_bps: client.seed.partner.commissionBps,
        applied_at: appliedAt.toISOString(),
        approved_by: client.seed.partner.status === 'active' ? growthId : null,
      })
      .select('id')
      .single()

    if (!ib) continue
    ibByEmail.set(client.seed.email, {
      id: ib.id as string,
      commissionBps: client.seed.partner.commissionBps,
      profileId: client.id,
    })

    await logAudit({
      actorId: client.id,
      actorRole: 'client',
      action: 'ib.application_submitted',
      entityType: 'introducing_broker',
      entityId: ib.id,
      afterState: { ibCode: client.referralCode, status: 'pending' },
      at: appliedAt,
    })

    if (client.seed.partner.status === 'active') {
      await logAudit({
        actorId: growthId,
        actorRole: 'marketing_growth',
        action: 'ib.status_changed',
        entityType: 'introducing_broker',
        entityId: ib.id,
        reason: 'Channel reviewed and approved.',
        beforeState: { status: 'pending' },
        afterState: { status: 'active', commissionBps: client.seed.partner.commissionBps },
        at: new Date(appliedAt.getTime() + 2 * 86_400_000),
      })
    }
  }

  // --- Referral attribution ------------------------------------------------
  for (const client of clients.values()) {
    if (!client.seed.referredBy) continue
    const partner = ibByEmail.get(client.seed.referredBy)
    if (!partner) continue

    await admin.from('referral_relationships').insert({
      referrer_id: partner.profileId,
      referee_id: client.id,
      ib_id: partner.id,
      created_at: monthsAgo(client.seed.joinedMonthsAgo).toISOString(),
    })
  }

  const { data: referralRows } = await admin
    .from('referral_relationships')
    .select('referee_id, ib_id')
  const ibByReferee = new Map(
    (referralRows ?? []).map((row) => [row.referee_id as string, row.ib_id as string]),
  )
  const commissionBpsByIb = new Map(
    [...ibByEmail.values()].map((partner) => [partner.id, partner.commissionBps]),
  )
  const profileIdByIb = new Map(
    [...ibByEmail.values()].map((partner) => [partner.id, partner.profileId]),
  )

  // --- Commissions off credited deposits -----------------------------------
  const commissionRows: { id: string; ibId: string; amount: number; at: Date }[] = []

  for (const deposit of creditedDeposits) {
    const ibId = ibByReferee.get(deposit.client.id)
    if (!ibId) continue

    const bps = commissionBpsByIb.get(ibId) ?? 150
    const amount = Math.round((deposit.amount * bps) / 100) / 100
    if (amount <= 0) continue

    // Older commissions have been settled; recent ones are still in the queue.
    const ageDays = (Date.now() - deposit.at.getTime()) / 86_400_000
    const status = ageDays > 60 ? 'paid' : ageDays > 20 ? 'approved' : 'pending'

    const { data: commission } = await admin
      .from('commissions')
      .insert({
        ib_id: ibId,
        source_client_id: deposit.client.id,
        amount,
        currency: 'USD',
        status,
        basis: 'deposit_bps',
        approved_by: status === 'pending' ? null : growthId,
        decided_at: status === 'pending' ? null : deposit.at.toISOString(),
        created_at: deposit.at.toISOString(),
      })
      .select('id')
      .single()

    if (commission) {
      commissionRows.push({ id: commission.id as string, ibId, amount, at: deposit.at })
    }
  }

  // Pay out the ones marked paid, through the ledger.
  for (const commission of commissionRows) {
    const { data: row } = await admin
      .from('commissions')
      .select('status')
      .eq('id', commission.id)
      .single()
    if (row?.status !== 'paid') continue

    const partnerProfileId = profileIdByIb.get(commission.ibId)
    if (!partnerProfileId) continue

    const partnerClient = [...clients.values()].find((c) => c.id === partnerProfileId)
    if (!partnerClient) continue

    const paidAt = new Date(commission.at.getTime() + 7 * 86_400_000)
    const transactionId = await post({
      type: 'commission',
      built: buildCommissionPayoutPosting({
        ibLedgerAccountId: partnerClient.ledgerAccountId,
        system,
        amount: usd(commission.amount),
      }),
      externalRef: `Commission payout to ${partnerClient.referralCode}`,
      occurredAt: paidAt,
    })

    await admin
      .from('commissions')
      .update({ paid_transaction_id: transactionId })
      .eq('id', commission.id)

    await logAudit({
      actorId: growthId,
      actorRole: 'marketing_growth',
      action: 'commission.paid',
      entityType: 'commission',
      entityId: commission.id,
      afterState: { status: 'paid', transactionId, amount: commission.amount },
      at: paidAt,
    })
  }

  // --- Client rebates ------------------------------------------------------
  for (const deposit of creditedDeposits.slice(0, 14)) {
    const amount = Math.round(deposit.amount * 0.25) / 100
    if (amount <= 0) continue

    const ageDays = (Date.now() - deposit.at.getTime()) / 86_400_000
    const status = ageDays > 45 ? 'paid' : 'pending'

    const { data: rebate } = await admin
      .from('rebates')
      .insert({
        client_id: deposit.client.id,
        amount,
        currency: 'USD',
        status,
        created_at: deposit.at.toISOString(),
      })
      .select('id')
      .single()

    if (rebate && status === 'paid') {
      const paidAt = new Date(deposit.at.getTime() + 5 * 86_400_000)
      const transactionId = await post({
        type: 'rebate',
        built: buildRebatePosting({
          clientLedgerAccountId: deposit.client.ledgerAccountId,
          system,
          amount: usd(amount),
        }),
        externalRef: 'Client rebate',
        occurredAt: paidAt,
      })
      await admin.from('rebates').update({ paid_transaction_id: transactionId }).eq('id', rebate.id)
    }
  }
}

// ---------------------------------------------------------------------------
// Support
// ---------------------------------------------------------------------------

const TICKET_SCRIPTS = [
  {
    clientPrefix: 'aisha.rahman',
    subject: 'Withdrawal still showing as pending',
    category: 'funding',
    priority: 'high' as const,
    status: 'pending' as const,
    ageDays: 1,
    messages: [
      {
        from: 'client' as const,
        body: 'I requested a withdrawal yesterday and it still shows as pending. Is something wrong with my account?',
      },
      {
        from: 'staff' as const,
        body: "Nothing is wrong. Withdrawals over $5,000 are reviewed by two separate members of our finance team before they are released — one has signed off and the second review is in progress. You'll get a notification the moment it's approved.",
      },
    ],
  },
  {
    clientPrefix: 'samuel.reyes',
    subject: 'Cannot connect MT5 on a new laptop',
    category: 'platform',
    priority: 'medium' as const,
    status: 'resolved' as const,
    ageDays: 12,
    messages: [
      {
        from: 'client' as const,
        body: 'I set up a new laptop and MetaTrader 5 refuses my login. The password manager says the details are right.',
      },
      {
        from: 'staff' as const,
        body: 'Your account is active on our side. Make sure you are selecting the AurionMarkets-Live01 server rather than a demo server in the MT5 login dialog — that is the usual cause.',
      },
      { from: 'client' as const, body: 'That was it. Wrong server. Thanks for the quick reply.' },
    ],
  },
  {
    clientPrefix: 'grace.oyelowo',
    subject: 'Which proof of address do you accept?',
    category: 'verification',
    priority: 'medium' as const,
    status: 'open' as const,
    ageDays: 2,
    messages: [
      {
        from: 'client' as const,
        body: 'My verification says my proof of address is too old. My bank only issues statements quarterly. What else can I send?',
      },
    ],
  },
  {
    clientPrefix: 'imogen.hale',
    subject: 'Partner commission for March',
    category: 'partners',
    priority: 'low' as const,
    status: 'pending' as const,
    ageDays: 4,
    messages: [
      {
        from: 'client' as const,
        body: 'Two of my referred clients funded in March but I only see one commission. Can you check?',
      },
      {
        from: 'staff' as const,
        body: 'Commission is generated when a deposit is actually credited, not when it is requested. The second deposit is still with our finance team, so its commission will appear once it clears. Nothing is lost.',
      },
    ],
  },
  {
    clientPrefix: 'viktor.ostrovsky',
    subject: 'Why is my account restricted?',
    category: 'account',
    priority: 'high' as const,
    status: 'open' as const,
    ageDays: 3,
    messages: [
      {
        from: 'client' as const,
        body: 'I tried to deposit this morning and the platform says my account is restricted. I have not been told why.',
      },
    ],
  },
  {
    clientPrefix: 'tobias.reinhardt',
    subject: 'Raw spread account — commission per lot?',
    category: 'general',
    priority: 'low' as const,
    status: 'closed' as const,
    ageDays: 30,
    messages: [
      {
        from: 'client' as const,
        body: 'Before I move over: is the $6 per lot on the Raw account charged per side or round-turn?',
      },
      {
        from: 'staff' as const,
        body: 'Round-turn — $6 covers both opening and closing the position, charged in your account currency.',
      },
    ],
  },
]

async function seedSupport(clients: Map<string, SeededClient>, staffIdByRole: Map<string, string>) {
  console.log('Seeding support tickets…')
  const agentId = staffIdByRole.get('support_agent')
  if (!agentId) throw new Error('Support agent not seeded')

  for (const script of TICKET_SCRIPTS) {
    const client = [...clients.values()].find((c) => c.seed.email.startsWith(script.clientPrefix))
    if (!client) continue

    const openedAt = daysAgo(script.ageDays)
    const hasStaffReply = script.messages.some((message) => message.from === 'staff')

    const { data: ticket } = await admin
      .from('support_tickets')
      .insert({
        client_id: client.id,
        subject: script.subject,
        category: script.category,
        priority: script.priority,
        status: script.status,
        assigned_to: hasStaffReply ? agentId : null,
        created_at: openedAt.toISOString(),
        updated_at: openedAt.toISOString(),
        first_response_at: hasStaffReply
          ? new Date(openedAt.getTime() + 5_400_000).toISOString()
          : null,
        resolved_at:
          script.status === 'resolved' || script.status === 'closed'
            ? new Date(openedAt.getTime() + 7_200_000).toISOString()
            : null,
      })
      .select('id, reference_code')
      .single()

    if (!ticket) continue

    for (const [index, message] of script.messages.entries()) {
      await admin.from('support_ticket_messages').insert({
        ticket_id: ticket.id,
        author_id: message.from === 'client' ? client.id : agentId,
        author_role: message.from === 'client' ? 'client' : 'support_agent',
        body: message.body,
        created_at: new Date(openedAt.getTime() + index * 3_600_000).toISOString(),
      })
    }

    await logAudit({
      actorId: client.id,
      actorRole: 'client',
      action: 'support_ticket.created',
      entityType: 'support_ticket',
      entityId: ticket.id,
      afterState: {
        subject: script.subject,
        category: script.category,
        priority: script.priority,
        reference: ticket.reference_code,
      },
      at: openedAt,
    })
  }
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function verifyLedgerIsSquare() {
  const { data, error } = await admin
    .from('trial_balance')
    .select('currency, total_debits, total_credits, difference, entry_count')

  if (error) throw new Error(`Could not read the trial balance: ${error.message}`)

  for (const row of data ?? []) {
    const difference = Number(row.difference)
    const label = `${row.currency}: ${Number(row.total_debits).toFixed(2)} debits vs ${Number(row.total_credits).toFixed(2)} credits across ${row.entry_count} entries`
    if (difference !== 0) {
      throw new Error(`Seed produced an unbalanced ledger — ${label} (out by ${difference})`)
    }
    console.log(`  ✓ trial balance square — ${label}`)
  }
}

async function main() {
  console.log('Seeding Aurion Markets demo data…\n')

  const system = await loadSystemAccounts()
  const { staffIdByRole, staffIdByEmail } = await seedStaff()
  const clients = await seedClients(staffIdByRole)
  await seedTradingAccounts(clients, staffIdByRole)
  const creditedDeposits = await seedMoneyMovement(clients, staffIdByRole, staffIdByEmail, system)
  await seedGrowth(clients, staffIdByRole, system, creditedDeposits)
  await seedSupport(clients, staffIdByRole)

  console.log('\nVerifying the ledger…')
  await verifyLedgerIsSquare()

  console.log(`
Done.

  Staff        ${STAFF_SEED.length} accounts, one per role
  Clients      ${clients.size} accounts across every verification state
  Password     ${DEMO_PASSWORD}  (every demo account)

  Admin console   /admin   — sign in as ava.morgan@aurion-markets.example
  Client portal   /portal  — sign in as samuel.reyes@demo.aurion-markets.test

Every value in this dataset is simulated. No real person, payment,
document or MT5 account is involved anywhere in it.
`)
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
