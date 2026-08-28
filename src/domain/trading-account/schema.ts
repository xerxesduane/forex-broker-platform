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
