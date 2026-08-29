/**
 * Deterministic, obviously-fictional demo identities. Every email lives
 * under aurion-markets.example / .test, which are reserved,
 * non-resolvable domains — never real people (docs/product-plan.md
 * "Demonstration data").
 */

export const DEMO_PASSWORD = 'AurionDemo!2026'

export const STAFF_SEED = [
  {
    email: 'ava.morgan@aurion-markets.example',
    firstName: 'Ava',
    lastName: 'Morgan',
    roleKey: 'super_admin',
    title: 'Chief Operating Officer',
  },
  {
    email: 'noah.whitfield@aurion-markets.example',
    firstName: 'Noah',
    lastName: 'Whitfield',
    roleKey: 'kyc_analyst',
    title: 'KYC Analyst',
  },
  {
    email: 'priya.desai@aurion-markets.example',
    firstName: 'Priya',
    lastName: 'Desai',
    roleKey: 'finance_operator',
    title: 'Finance Operator',
  },
  {
    email: 'marcus.oyelaran@aurion-markets.example',
    firstName: 'Marcus',
    lastName: 'Oyelaran',
    roleKey: 'finance_approver',
    title: 'Head of Finance',
  },
  {
    email: 'lena.brooks@aurion-markets.example',
    firstName: 'Lena',
    lastName: 'Brooks',
    roleKey: 'support_agent',
    title: 'Client Support',
  },
  {
    email: 'tomas.iversen@aurion-markets.example',
    firstName: 'Tomas',
    lastName: 'Iversen',
    roleKey: 'trading_operations',
    title: 'Trading Operations',
  },
  {
    email: 'sofia.marchetti@aurion-markets.example',
    firstName: 'Sofia',
    lastName: 'Marchetti',
    roleKey: 'marketing_growth',
    title: 'Partnerships Manager',
  },
  {
    email: 'rachel.okonkwo@aurion-markets.example',
    firstName: 'Rachel',
    lastName: 'Okonkwo',
    roleKey: 'administrator',
    title: 'Platform Administrator',
  },
  {
    email: 'henry.laurent@aurion-markets.example',
    firstName: 'Henry',
    lastName: 'Laurent',
    roleKey: 'auditor',
    title: 'Internal Auditor',
  },
  // A second finance approver, so the maker-checker rule on large
  // withdrawals can actually be demonstrated end to end.
  {
    email: 'yuki.tanaka@aurion-markets.example',
    firstName: 'Yuki',
    lastName: 'Tanaka',
    roleKey: 'finance_approver',
    title: 'Finance Approver',
  },
] as const

export type ClientKycState =
  'not_started' | 'submitted' | 'in_review' | 'needs_revision' | 'approved' | 'rejected'

export type ClientSeed = {
  email: string
  firstName: string
  lastName: string
  kycState: ClientKycState
  country: string
  city: string
  /** Months ago the account was created — spreads the acquisition chart. */
  joinedMonthsAgo: number
  accountStatus?: 'active' | 'restricted' | 'suspended' | 'closed'
  riskRating?: 'low' | 'medium' | 'high'
  /** Rough scale of this client's funding, used to generate deposits. */
  fundingProfile?: 'none' | 'light' | 'steady' | 'heavy'
  /** Marks this client as an introducing broker in the seed. */
  partner?: { status: 'pending' | 'active' | 'suspended'; commissionBps: number }
  /** Email of the partner who introduced them. */
  referredBy?: string
}

export const CLIENT_SEED: ClientSeed[] = [
  // --- Partners -----------------------------------------------------------
  {
    email: 'imogen.hale@demo.aurion-markets.test',
    firstName: 'Imogen',
    lastName: 'Hale',
    kycState: 'approved',
    country: 'GB',
    city: 'Manchester',
    joinedMonthsAgo: 11,
    fundingProfile: 'heavy',
    partner: { status: 'active', commissionBps: 200 },
  },
  {
    email: 'kwame.mensah@demo.aurion-markets.test',
    firstName: 'Kwame',
    lastName: 'Mensah',
    kycState: 'approved',
    country: 'GH',
    city: 'Accra',
    joinedMonthsAgo: 9,
    fundingProfile: 'steady',
    partner: { status: 'active', commissionBps: 150 },
  },
  {
    email: 'lucia.ferreira@demo.aurion-markets.test',
    firstName: 'Lucia',
    lastName: 'Ferreira',
    kycState: 'approved',
    country: 'PT',
    city: 'Porto',
    joinedMonthsAgo: 4,
    fundingProfile: 'light',
    partner: { status: 'pending', commissionBps: 150 },
  },

  // --- Verified, funded clients -------------------------------------------
  {
    email: 'samuel.reyes@demo.aurion-markets.test',
    firstName: 'Samuel',
    lastName: 'Reyes',
    kycState: 'approved',
    country: 'US',
    city: 'Austin',
    joinedMonthsAgo: 10,
    fundingProfile: 'heavy',
    referredBy: 'imogen.hale@demo.aurion-markets.test',
  },
  {
    email: 'aisha.rahman@demo.aurion-markets.test',
    firstName: 'Aisha',
    lastName: 'Rahman',
    kycState: 'approved',
    country: 'AE',
    city: 'Dubai',
    joinedMonthsAgo: 8,
    fundingProfile: 'heavy',
    referredBy: 'imogen.hale@demo.aurion-markets.test',
  },
  {
    email: 'mateo.silva@demo.aurion-markets.test',
    firstName: 'Mateo',
    lastName: 'Silva',
    kycState: 'approved',
    country: 'BR',
    city: 'São Paulo',
    joinedMonthsAgo: 7,
    fundingProfile: 'steady',
    referredBy: 'imogen.hale@demo.aurion-markets.test',
  },
  {
    email: 'freya.lindqvist@demo.aurion-markets.test',
    firstName: 'Freya',
    lastName: 'Lindqvist',
    kycState: 'approved',
    country: 'SE',
    city: 'Gothenburg',
    joinedMonthsAgo: 6,
    fundingProfile: 'steady',
    referredBy: 'kwame.mensah@demo.aurion-markets.test',
  },
  {
    email: 'omar.haddad@demo.aurion-markets.test',
    firstName: 'Omar',
    lastName: 'Haddad',
    kycState: 'approved',
    country: 'JO',
    city: 'Amman',
    joinedMonthsAgo: 5,
    fundingProfile: 'steady',
    referredBy: 'kwame.mensah@demo.aurion-markets.test',
  },
  {
    email: 'chiara.rossi@demo.aurion-markets.test',
    firstName: 'Chiara',
    lastName: 'Rossi',
    kycState: 'approved',
    country: 'IT',
    city: 'Bologna',
    joinedMonthsAgo: 5,
    fundingProfile: 'light',
  },
  {
    email: 'devon.clarke@demo.aurion-markets.test',
    firstName: 'Devon',
    lastName: 'Clarke',
    kycState: 'approved',
    country: 'CA',
    city: 'Halifax',
    joinedMonthsAgo: 4,
    fundingProfile: 'light',
    referredBy: 'kwame.mensah@demo.aurion-markets.test',
  },
  {
    email: 'nadia.petrova@demo.aurion-markets.test',
    firstName: 'Nadia',
    lastName: 'Petrova',
    kycState: 'approved',
    country: 'BG',
    city: 'Plovdiv',
    joinedMonthsAgo: 3,
    fundingProfile: 'light',
  },
  {
    email: 'tobias.reinhardt@demo.aurion-markets.test',
    firstName: 'Tobias',
    lastName: 'Reinhardt',
    kycState: 'approved',
    country: 'DE',
    city: 'Leipzig',
    joinedMonthsAgo: 2,
    fundingProfile: 'steady',
  },

  // --- Compliance-interesting cases ---------------------------------------
  {
    email: 'viktor.ostrovsky@demo.aurion-markets.test',
    firstName: 'Viktor',
    lastName: 'Ostrovsky',
    kycState: 'approved',
    country: 'CY',
    city: 'Limassol',
    joinedMonthsAgo: 6,
    accountStatus: 'restricted',
    riskRating: 'high',
    fundingProfile: 'steady',
  },
  {
    email: 'marcus.bell@demo.aurion-markets.test',
    firstName: 'Marcus',
    lastName: 'Bell',
    kycState: 'approved',
    country: 'ZA',
    city: 'Cape Town',
    joinedMonthsAgo: 5,
    accountStatus: 'suspended',
    riskRating: 'high',
    fundingProfile: 'light',
  },
  {
    email: 'helena.novak@demo.aurion-markets.test',
    firstName: 'Helena',
    lastName: 'Novak',
    kycState: 'approved',
    country: 'CZ',
    city: 'Brno',
    joinedMonthsAgo: 3,
    riskRating: 'medium',
    fundingProfile: 'light',
  },

  // --- In-flight verification ---------------------------------------------
  {
    email: 'priti.nakamura@demo.aurion-markets.test',
    firstName: 'Priti',
    lastName: 'Nakamura',
    kycState: 'in_review',
    country: 'SG',
    city: 'Singapore',
    joinedMonthsAgo: 1,
  },
  {
    email: 'andres.gutierrez@demo.aurion-markets.test',
    firstName: 'Andrés',
    lastName: 'Gutiérrez',
    kycState: 'submitted',
    country: 'ES',
    city: 'Valencia',
    joinedMonthsAgo: 1,
  },
  {
    email: 'yuki.sato@demo.aurion-markets.test',
    firstName: 'Yuki',
    lastName: 'Sato',
    kycState: 'submitted',
    country: 'JP',
    city: 'Fukuoka',
    joinedMonthsAgo: 0,
  },
  {
    email: 'grace.oyelowo@demo.aurion-markets.test',
    firstName: 'Grace',
    lastName: 'Oyelowo',
    kycState: 'needs_revision',
    country: 'NG',
    city: 'Lagos',
    joinedMonthsAgo: 2,
  },
  {
    email: 'daniel.kowalski@demo.aurion-markets.test',
    firstName: 'Daniel',
    lastName: 'Kowalski',
    kycState: 'rejected',
    country: 'PL',
    city: 'Kraków',
    joinedMonthsAgo: 4,
    riskRating: 'high',
  },

  // --- Not started ---------------------------------------------------------
  {
    email: 'jordan.ellery@demo.aurion-markets.test',
    firstName: 'Jordan',
    lastName: 'Ellery',
    kycState: 'not_started',
    country: 'CA',
    city: 'Victoria',
    joinedMonthsAgo: 0,
  },
  {
    email: 'sana.iqbal@demo.aurion-markets.test',
    firstName: 'Sana',
    lastName: 'Iqbal',
    kycState: 'not_started',
    country: 'PK',
    city: 'Lahore',
    joinedMonthsAgo: 0,
  },
]

/** Obviously-fictional street addresses, cycled through the client list. */
export const DEMO_ADDRESSES = [
  { line1: '12 Fictional Way', postal: 'DM1 0AA' },
  { line1: '48 Placeholder Street', postal: 'DM2 0BB' },
  { line1: '7 Example Court', postal: 'DM3 0CC' },
  { line1: '203 Sample Avenue', postal: 'DM4 0DD' },
  { line1: '91 Notional Road', postal: 'DM5 0EE' },
] as const
