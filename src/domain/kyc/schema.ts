import { z } from 'zod'
import { EMPLOYMENT_STATUSES, KYC_DOCUMENT_TYPES, SOURCE_OF_FUNDS } from './types'

export const kycSubmissionSchema = z.object({
  employmentStatus: z.enum(EMPLOYMENT_STATUSES, {
    message: 'Select your employment status.',
  }),
  sourceOfFunds: z.enum(SOURCE_OF_FUNDS, { message: 'Select a source of funds.' }),
  declaredCountry: z.string().trim().min(2, 'Select a country.'),
  accurateInfoConfirmed: z
    .boolean()
    .refine((v) => v === true, 'You must confirm the information provided is accurate.'),
})

export type KycSubmissionInput = z.infer<typeof kycSubmissionSchema>

/** Validated separately from the form fields above because it describes a
 * file, whose presence/size are checked where the upload actually happens
 * (client + server action), not as part of the domain form schema. */
export const kycDocumentMetadataSchema = z.object({
  docType: z.enum(KYC_DOCUMENT_TYPES),
  originalFilename: z.string().trim().min(1).max(255),
  contentType: z.string().trim().min(1).max(120),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(10 * 1024 * 1024, 'File must be 10MB or smaller.'),
})

export type KycDocumentMetadataInput = z.infer<typeof kycDocumentMetadataSchema>
