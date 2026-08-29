import { z } from 'zod'
import { ALLOWED_LEVERAGE_OPTIONS } from './types'

export const demoAccountRequestSchema = z.object({
  baseCurrency: z.enum(['USD', 'EUR', 'GBP'], { message: 'Select a base currency.' }),
  leverage: z
    .number()
    .refine(
      (v) => (ALLOWED_LEVERAGE_OPTIONS as readonly number[]).includes(v),
      'Select a valid leverage option.',
    ),
  declarationAccepted: z
    .boolean()
    .refine((v) => v === true, 'You must accept the demo account declaration.'),
})

export type DemoAccountRequestInput = z.infer<typeof demoAccountRequestSchema>

/**
 * A real-account request. Unlike a demo account this does not
 * auto-provision — `trading.real_accounts_require_approval` sends it to
 * the trading-operations queue, which is how a live broker actually
 * works.
 */
export const realAccountRequestSchema = z.object({
  plan: z.enum(['standard', 'raw'], { message: 'Choose an account plan.' }),
  baseCurrency: z.enum(['USD', 'EUR', 'GBP'], { message: 'Select a base currency.' }),
  leverage: z
    .number()
    .refine(
      (v) => (ALLOWED_LEVERAGE_OPTIONS as readonly number[]).includes(v),
      'Select a valid leverage option.',
    ),
  nickname: z.string().trim().max(40, 'Keep the nickname under 40 characters.').optional(),
  riskWarningAccepted: z
    .boolean()
    .refine((v) => v === true, 'You must acknowledge the risk warning to continue.'),
})

export type RealAccountRequestInput = z.infer<typeof realAccountRequestSchema>

/** A trading-operations decision on a queued account request. */
export const accountProvisioningDecisionSchema = z.discriminatedUnion('decision', [
  z.object({
    decision: z.literal('provision'),
    tradingAccountId: z.uuid(),
    reason: z.string().trim().max(500).optional(),
  }),
  z.object({
    decision: z.literal('reject'),
    tradingAccountId: z.uuid(),
    reason: z.string().trim().min(10, 'Give the client a reason for the rejection.').max(500),
  }),
])

export type AccountProvisioningDecisionInput = z.infer<typeof accountProvisioningDecisionSchema>

export const accountLifecycleSchema = z.object({
  tradingAccountId: z.uuid(),
  action: z.enum(['suspend', 'reactivate', 'close']),
  reason: z.string().trim().min(6, 'Give a reason — account changes are audited.').max(500),
})

export type AccountLifecycleInput = z.infer<typeof accountLifecycleSchema>
