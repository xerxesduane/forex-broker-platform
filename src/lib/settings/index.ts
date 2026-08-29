import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { FinanceSettings } from '@/domain/finance/types'
import { SETTING_SCHEMAS, type SettingKey } from '@/domain/settings/schema'

export type SettingRow = {
  key: string
  value: unknown
  label: string
  description: string
  group: string
  updated_at: string
  updated_by: string | null
}

/**
 * Defaults that match the values seeded in migration 12. Used only when a
 * settings row is missing or fails validation, so a bad edit degrades to
 * safe behaviour instead of taking a page down mid-demo.
 */
const FALLBACKS: Record<SettingKey, unknown> = {
  'brand.name': 'Aurion Markets',
  'brand.support_email': 'support@aurion-markets.example',
  'brand.support_hours': '24/5, Monday 00:00 – Friday 22:00 UTC',
  'finance.deposit_min': 50,
  'finance.deposit_auto_credit_limit': 2500,
  'finance.withdrawal_min': 50,
  'finance.withdrawal_fee': 5,
  'finance.withdrawal_dual_approval_threshold': 5000,
  'trading.leverage_options': [50, 100, 200, 500],
  'trading.demo_starting_balance': 10_000,
  'trading.real_accounts_require_approval': true,
  'growth.referral_commission_bps': 150,
  'growth.rebate_bps': 25,
  'compliance.kyc_document_types': ['identity_document', 'proof_of_address'],
}

export type SettingsMap = Map<string, unknown>

export async function loadSettings(supabase: SupabaseClient): Promise<SettingsMap> {
  const { data } = await supabase.from('platform_settings').select('key, value')
  const map: SettingsMap = new Map()
  for (const row of data ?? []) {
    map.set(row.key as string, row.value)
  }
  return map
}

export async function loadSettingRows(supabase: SupabaseClient): Promise<SettingRow[]> {
  const { data } = await supabase
    .from('platform_settings')
    .select('key, value, label, description, group, updated_at, updated_by')
    .order('group')
    .order('key')
  return (data ?? []) as unknown as SettingRow[]
}

/** Read one setting, validated against its schema, falling back on failure. */
export function readSetting<K extends SettingKey>(
  settings: SettingsMap,
  key: K,
): ReturnType<(typeof SETTING_SCHEMAS)[K]['parse']> {
  const parsed = SETTING_SCHEMAS[key].safeParse(settings.get(key))
  if (parsed.success) {
    return parsed.data as ReturnType<(typeof SETTING_SCHEMAS)[K]['parse']>
  }
  return SETTING_SCHEMAS[key].parse(FALLBACKS[key]) as ReturnType<
    (typeof SETTING_SCHEMAS)[K]['parse']
  >
}

/** The finance domain's view of settings, in one call. */
export async function loadFinanceSettings(supabase: SupabaseClient): Promise<FinanceSettings> {
  const settings = await loadSettings(supabase)
  return {
    depositMin: readSetting(settings, 'finance.deposit_min'),
    depositAutoCreditLimit: readSetting(settings, 'finance.deposit_auto_credit_limit'),
    withdrawalMin: readSetting(settings, 'finance.withdrawal_min'),
    withdrawalFee: readSetting(settings, 'finance.withdrawal_fee'),
    withdrawalDualApprovalThreshold: readSetting(
      settings,
      'finance.withdrawal_dual_approval_threshold',
    ),
  }
}
