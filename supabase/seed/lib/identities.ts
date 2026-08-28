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
  },
  {
    email: 'noah.whitfield@aurion-markets.example',
    firstName: 'Noah',
    lastName: 'Whitfield',
    roleKey: 'kyc_analyst',
  },
  {
    email: 'priya.desai@aurion-markets.example',
    firstName: 'Priya',
    lastName: 'Desai',
    roleKey: 'finance_operator',
  },
  {
    email: 'marcus.oyelaran@aurion-markets.example',
    firstName: 'Marcus',
    lastName: 'Oyelaran',
    roleKey: 'finance_approver',
  },
  {
    email: 'lena.brooks@aurion-markets.example',
    firstName: 'Lena',
    lastName: 'Brooks',
    roleKey: 'support_agent',
  },
] as const

export const CLIENT_SEED = [
  {
    email: 'jordan.ellery@demo.aurion-markets.test',
    firstName: 'Jordan',
    lastName: 'Ellery',
    kycState: 'not_started' as const,
    country: 'CA',
  },
  {
    email: 'priti.nakamura@demo.aurion-markets.test',
    firstName: 'Priti',
    lastName: 'Nakamura',
    kycState: 'in_review' as const,
    country: 'SG',
  },
  {
    email: 'samuel.reyes@demo.aurion-markets.test',
    firstName: 'Samuel',
    lastName: 'Reyes',
    kycState: 'approved' as const,
    country: 'US',
  },
  {
    email: 'imogen.hale@demo.aurion-markets.test',
    firstName: 'Imogen',
    lastName: 'Hale',
    kycState: 'approved' as const,
    country: 'GB',
  },
  {
    email: 'daniel.kowalski@demo.aurion-markets.test',
    firstName: 'Daniel',
    lastName: 'Kowalski',
    kycState: 'rejected' as const,
    country: 'DE',
  },
] as const
