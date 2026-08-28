import { z } from 'zod'

const MIN_AGE_YEARS = 18

function isAtLeastAge(dateOfBirth: string, years: number): boolean {
  const dob = new Date(dateOfBirth)
  if (Number.isNaN(dob.getTime())) return false
  const cutoff = new Date()
  cutoff.setFullYear(cutoff.getFullYear() - years)
  return dob <= cutoff
}

export const profileCompletionSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required.').max(80),
  lastName: z.string().trim().min(1, 'Last name is required.').max(80),
  dateOfBirth: z
    .string()
    .min(1, 'Date of birth is required.')
    .refine((v) => !Number.isNaN(new Date(v).getTime()), 'Enter a valid date.')
    .refine(
      (v) => isAtLeastAge(v, MIN_AGE_YEARS),
      `You must be at least ${MIN_AGE_YEARS} years old to open a demo account.`,
    ),
  phoneNumber: z
    .string()
    .trim()
    .min(6, 'Enter a valid phone number.')
    .max(20)
    .regex(/^[0-9+()\-\s]+$/, 'Enter a valid phone number.'),
  countryOfResidence: z.string().trim().min(2, 'Select a country.'),
  addressLine1: z.string().trim().min(1, 'Address is required.').max(120),
  addressLine2: z.string().trim().max(120).optional().or(z.literal('')),
  city: z.string().trim().min(1, 'City is required.').max(80),
  region: z.string().trim().max(80).optional().or(z.literal('')),
  postalCode: z.string().trim().min(1, 'Postal code is required.').max(20),
})

export type ProfileCompletionInput = z.infer<typeof profileCompletionSchema>
