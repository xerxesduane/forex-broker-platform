import { z } from 'zod'

export const ibApplicationSchema = z.object({
  websiteOrChannel: z
    .string()
    .trim()
    .min(4, 'Tell us where you introduce clients (a site, channel or community).')
    .max(200, 'Keep this under 200 characters.'),
  expectedMonthlyReferrals: z.coerce
    .number({ message: 'Enter a number.' })
    .int('Enter a whole number.')
    .min(1, 'Enter at least 1.')
    .max(10_000, 'That is beyond this demo environment.'),
  acceptPartnerTerms: z
    .boolean()
    .refine((v) => v === true, 'You must accept the partner terms to apply.'),
})

export type IbApplicationInput = z.infer<typeof ibApplicationSchema>

export const commissionDecisionSchema = z.object({
  commissionId: z.uuid(),
  decision: z.enum(['approve', 'void']),
  reason: z.string().trim().max(500).optional(),
})

export type CommissionDecisionInput = z.infer<typeof commissionDecisionSchema>

export const ibStatusSchema = z.object({
  ibId: z.uuid(),
  status: z.enum(['pending', 'active', 'suspended']),
  commissionBps: z.coerce
    .number()
    .int('Basis points must be a whole number.')
    .min(0, 'Cannot be negative.')
    .max(2000, 'Cap the commission at 2000bp (20%) in this demo.'),
  reason: z.string().trim().max(500).optional(),
})

export type IbStatusInput = z.infer<typeof ibStatusSchema>
