/**
 * Platform settings live in the database as jsonb, which means the
 * application is the only thing that knows what shape each key should
 * hold. That knowledge lives here, as one schema per key, so a bad
 * settings edit is a validation error rather than a runtime crash three
 * screens away.
 */
import { z } from 'zod'

const positiveMoney = z.coerce
  .number({ message: 'Enter a number.' })
  .min(0, 'Cannot be negative.')
  .max(10_000_000, 'That value is beyond this demo environment.')

const basisPoints = z.coerce
  .number({ message: 'Enter a number.' })
  .int('Basis points must be a whole number.')
  .min(0, 'Cannot be negative.')
  .max(10_000, '10,000bp is 100% — pick a lower value.')

export const SETTING_SCHEMAS = {
  'brand.name': z.string().trim().min(2, 'Enter a brand name.').max(60),
  'brand.support_email': z.email('Enter a valid email address.'),
  'brand.support_hours': z.string().trim().min(4).max(120),
  'finance.deposit_min': positiveMoney,
  'finance.deposit_auto_credit_limit': positiveMoney,
  'finance.withdrawal_min': positiveMoney,
  'finance.withdrawal_fee': positiveMoney,
  'finance.withdrawal_dual_approval_threshold': positiveMoney,
  'trading.leverage_options': z
    .array(z.coerce.number().int().min(1).max(1000))
    .min(1, 'Offer at least one leverage option.'),
  'trading.demo_starting_balance': positiveMoney,
  'trading.real_accounts_require_approval': z.coerce.boolean(),
  'growth.referral_commission_bps': basisPoints,
  'growth.rebate_bps': basisPoints,
  'compliance.kyc_document_types': z.array(z.string().trim().min(2)).min(1),
} as const

export type SettingKey = keyof typeof SETTING_SCHEMAS

export function isSettingKey(key: string): key is SettingKey {
  return key in SETTING_SCHEMAS
}

export const updateSettingSchema = z.object({
  key: z.string().refine(isSettingKey, 'Unknown setting.'),
  /** Raw form value; validated against the per-key schema by the action. */
  value: z.string(),
})

export type UpdateSettingInput = z.infer<typeof updateSettingSchema>

export const updateEmailTemplateSchema = z.object({
  key: z.string().trim().min(2),
  subject: z.string().trim().min(4, 'Enter a subject line.').max(200),
  body: z.string().trim().min(20, 'The body is too short.').max(8000),
})

export type UpdateEmailTemplateInput = z.infer<typeof updateEmailTemplateSchema>

/**
 * Parses a raw string from the settings form into the shape the key
 * expects. Numbers and booleans arrive as strings from HTML inputs;
 * arrays arrive as comma-separated or JSON text.
 */
export function parseSettingValue(
  key: SettingKey,
  raw: string,
): { ok: true; value: unknown } | { ok: false; error: string } {
  const schema = SETTING_SCHEMAS[key]
  let candidate: unknown = raw

  if (key === 'trading.leverage_options') {
    candidate = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  } else if (key === 'compliance.kyc_document_types') {
    candidate = raw
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
  } else if (key === 'trading.real_accounts_require_approval') {
    candidate = raw === 'true' || raw === 'on'
  }

  const result = schema.safeParse(candidate)
  if (!result.success) {
    return { ok: false, error: result.error.issues[0]?.message ?? 'Invalid value.' }
  }
  return { ok: true, value: result.data }
}
