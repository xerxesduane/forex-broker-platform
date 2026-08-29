import { z } from 'zod'

export const clientStatusSchema = z.object({
  clientId: z.uuid(),
  accountStatus: z.enum(['active', 'restricted', 'suspended', 'closed']),
  reason: z
    .string()
    .trim()
    .min(10, 'Explain the change in at least 10 characters — clients and auditors see this.')
    .max(500),
})

export type ClientStatusInput = z.infer<typeof clientStatusSchema>

export const clientRiskSchema = z.object({
  clientId: z.uuid(),
  riskRating: z.enum(['low', 'medium', 'high']),
  reason: z.string().trim().min(6, 'Give a reason for the rating.').max(500),
})

export type ClientRiskInput = z.infer<typeof clientRiskSchema>

export const clientNoteSchema = z.object({
  clientId: z.uuid(),
  body: z.string().trim().min(4, 'Write a note.').max(2000),
  pinned: z.boolean().optional(),
})

export type ClientNoteInput = z.infer<typeof clientNoteSchema>
