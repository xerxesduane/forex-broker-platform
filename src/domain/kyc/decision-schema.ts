import { z } from 'zod'

export const kycDecisionSchema = z.discriminatedUnion('decision', [
  z.object({ decision: z.literal('approve'), reason: z.string().trim().max(500).optional() }),
  z.object({
    decision: z.literal('reject'),
    reason: z.string().trim().min(10, 'Provide a reason for rejecting this case.').max(500),
  }),
])

export type KycDecisionInput = z.infer<typeof kycDecisionSchema>
