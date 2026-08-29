import { z } from 'zod'

export const createTicketSchema = z.object({
  subject: z
    .string()
    .trim()
    .min(6, 'Give the ticket a subject of at least 6 characters.')
    .max(140, 'Keep the subject under 140 characters.'),
  category: z.enum(['general', 'account', 'verification', 'funding', 'platform', 'partners'], {
    message: 'Choose a category.',
  }),
  priority: z.enum(['low', 'medium', 'high']),
  body: z
    .string()
    .trim()
    .min(20, 'Describe the issue in at least 20 characters so we can help first time.')
    .max(4000, 'Keep the message under 4000 characters.'),
})

export type CreateTicketInput = z.infer<typeof createTicketSchema>

export const ticketReplySchema = z.object({
  ticketId: z.uuid(),
  body: z
    .string()
    .trim()
    .min(2, 'Write a reply.')
    .max(4000, 'Keep the message under 4000 characters.'),
})

export type TicketReplyInput = z.infer<typeof ticketReplySchema>

export const ticketUpdateSchema = z.object({
  ticketId: z.uuid(),
  status: z.enum(['open', 'pending', 'resolved', 'closed']).optional(),
  priority: z.enum(['low', 'medium', 'high']).optional(),
  assignedTo: z.union([z.uuid(), z.literal('')]).optional(),
})

export type TicketUpdateInput = z.infer<typeof ticketUpdateSchema>
