import { describe, expect, it } from 'vitest'
import { profileCompletionSchema } from './schema'

const validInput = {
  firstName: 'Jordan',
  lastName: 'Ellery',
  dateOfBirth: '1990-05-15',
  phoneNumber: '+1 555 111 2222',
  countryOfResidence: 'CA',
  addressLine1: '123 Demo Street',
  addressLine2: '',
  city: 'Toronto',
  region: 'ON',
  postalCode: 'M4B1B3',
}

describe('profileCompletionSchema', () => {
  it('accepts a valid fictional profile', () => {
    const result = profileCompletionSchema.safeParse(validInput)
    expect(result.success).toBe(true)
  })

  it('rejects an applicant under 18', () => {
    const result = profileCompletionSchema.safeParse({
      ...validInput,
      dateOfBirth: new Date().toISOString().slice(0, 10),
    })
    expect(result.success).toBe(false)
  })

  it('rejects a missing first name', () => {
    const result = profileCompletionSchema.safeParse({ ...validInput, firstName: '' })
    expect(result.success).toBe(false)
  })

  it('rejects a malformed phone number', () => {
    const result = profileCompletionSchema.safeParse({ ...validInput, phoneNumber: 'call-me' })
    expect(result.success).toBe(false)
  })
})
