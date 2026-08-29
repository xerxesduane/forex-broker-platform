/**
 * Zod 4 schemas for every finance boundary (forms and server action
 * arguments). Validate at the edge, trust the types inside.
 */
import { z } from 'zod'

/**
 * Money arrives from an HTML form as a string, so coerce — but reject
 * anything with more precision than the numeric(18,2) column can hold
 * rather than silently rounding a client's money. The epsilon comparison
 * is deliberate: `10.01 * 100` is 1000.9999999999999 in IEEE-754, so a
 * modulo test would reject perfectly valid input.
 */
const amountField = z.coerce
  .number({ message: 'Enter an amount.' })
  .positive('Enter an amount greater than zero.')
  .max(10_000_000, 'That amount is beyond this demo environment.')
  .refine((value) => Math.abs(value * 100 - Math.round(value * 100)) < 1e-6, {
    message: 'Use at most two decimal places.',
  })

export const depositRequestSchema = z.object({
  amount: amountField,
  method: z.enum(['card', 'bank_transfer', 'crypto_usdt', 'skrill'], {
    message: 'Choose a funding method.',
  }),
})

export type DepositRequestInput = z.infer<typeof depositRequestSchema>

export const withdrawalRequestSchema = z.object({
  amount: amountField,
  method: z.enum(['bank_transfer', 'card_refund', 'crypto_usdt'], {
    message: 'Choose a payout method.',
  }),
  payoutDetail: z
    .string()
    .trim()
    .min(4, 'Add the payout destination (demo values only — never real bank details).')
    .max(140, 'Keep the payout reference under 140 characters.'),
})

export type WithdrawalRequestInput = z.infer<typeof withdrawalRequestSchema>

export const internalTransferSchema = z.object({
  toReferralCode: z
    .string()
    .trim()
    .min(3, "Enter the recipient's client reference.")
    .max(40, 'That reference is too long.'),
  amount: amountField,
  note: z.string().trim().max(140, 'Keep the note under 140 characters.').optional(),
})

export type InternalTransferInput = z.infer<typeof internalTransferSchema>

/** A staff decision on a queued deposit or withdrawal. */
export const moneyMovementDecisionSchema = z
  .object({
    decision: z.enum(['approve', 'reject']),
    notes: z.string().trim().max(500, 'Keep notes under 500 characters.').optional(),
  })
  .refine((value) => value.decision === 'approve' || (value.notes?.length ?? 0) >= 4, {
    message:
      'A rejection needs a reason — it is shown to the client and recorded in the audit log.',
    path: ['notes'],
  })

export type MoneyMovementDecisionInput = z.infer<typeof moneyMovementDecisionSchema>

/**
 * A manual ledger adjustment. `reason` is mandatory and has no default:
 * an adjustment without a stated reason is exactly the kind of entry an
 * audit is looking for.
 */
export const manualAdjustmentSchema = z.object({
  clientId: z.uuid('Select a client.'),
  amount: amountField,
  direction: z.enum(['credit_client', 'debit_client']),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain the adjustment in at least 10 characters — this is permanent evidence.')
    .max(500, 'Keep the reason under 500 characters.'),
})

export type ManualAdjustmentInput = z.infer<typeof manualAdjustmentSchema>

export const reverseTransactionSchema = z.object({
  transactionId: z.uuid(),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain the reversal in at least 10 characters.')
    .max(500, 'Keep the reason under 500 characters.'),
})

export type ReverseTransactionInput = z.infer<typeof reverseTransactionSchema>
