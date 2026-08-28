export type KycStatus =
  'not_started' | 'submitted' | 'in_review' | 'needs_revision' | 'approved' | 'rejected'

export type KycEvent =
  | { type: 'SUBMIT' }
  | { type: 'START_REVIEW' }
  | { type: 'REQUEST_REVISION'; reason: string }
  | { type: 'RESUBMIT' }
  | { type: 'APPROVE'; reason?: string }
  | { type: 'REJECT'; reason: string }

export const KYC_DOCUMENT_TYPES = ['identity_document', 'proof_of_address'] as const
export type KycDocumentType = (typeof KYC_DOCUMENT_TYPES)[number]

export const EMPLOYMENT_STATUSES = [
  'employed',
  'self_employed',
  'unemployed',
  'student',
  'retired',
] as const
export type EmploymentStatus = (typeof EMPLOYMENT_STATUSES)[number]

export const SOURCE_OF_FUNDS = [
  'salary',
  'business_income',
  'savings',
  'investments',
  'inheritance',
  'other',
] as const
export type SourceOfFunds = (typeof SOURCE_OF_FUNDS)[number]
