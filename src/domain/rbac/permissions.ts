/**
 * Atomic permission keys (ADR 0004). This list must stay in sync with the
 * catalogue seeded in supabase/migrations/00000000000002_identity_and_rbac.sql
 * — that migration is the source of truth for what exists in the
 * database; this file exists for typed, autocompletable call sites.
 */
export const PERMISSIONS = {
  KYC_VIEW: 'kyc.view',
  KYC_REVIEW: 'kyc.review',
  KYC_DECIDE: 'kyc.decide',
  CLIENT_VIEW: 'client.view',
  CLIENT_MANAGE: 'client.manage',
  TRADING_ACCOUNT_VIEW: 'trading_account.view',
  TRADING_ACCOUNT_PROVISION: 'trading_account.provision',
  TRADING_ACCOUNT_MANAGE: 'trading_account.manage',
  WALLET_VIEW: 'wallet.view',
  LEDGER_VIEW: 'ledger.view',
  LEDGER_ADJUST: 'ledger.adjust',
  DEPOSIT_VIEW: 'deposit.view',
  DEPOSIT_APPROVE: 'deposit.approve',
  WITHDRAWAL_VIEW: 'withdrawal.view',
  WITHDRAWAL_APPROVE: 'withdrawal.approve',
  REFERRAL_MANAGE: 'referral.manage',
  COMMISSION_MANAGE: 'commission.manage',
  SUPPORT_VIEW: 'support.view',
  SUPPORT_MANAGE: 'support.manage',
  STAFF_MANAGE: 'staff.manage',
  ROLE_MANAGE: 'role.manage',
  AUDIT_VIEW: 'audit.view',
  SETTINGS_MANAGE: 'settings.manage',
  INTEGRATION_VIEW: 'integration.view',
} as const

export type PermissionKey = (typeof PERMISSIONS)[keyof typeof PERMISSIONS]

export const STAFF_ROLE_KEYS = [
  'super_admin',
  'kyc_analyst',
  'finance_operator',
  'finance_approver',
  'support_agent',
  'trading_operations',
  'marketing_growth',
  'administrator',
  'auditor',
] as const

export type StaffRoleKey = (typeof STAFF_ROLE_KEYS)[number]
