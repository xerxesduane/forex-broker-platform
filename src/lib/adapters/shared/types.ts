import type { Result } from '@/domain/shared/result'

/** Structured, expected-failure shape every adapter method returns instead
 * of throwing (ADR 0005) — `retryable` tells a caller whether re-driving
 * with the same idempotency key is safe to attempt. */
export type AdapterError = {
  code: string
  message: string
  retryable: boolean
}

export type AdapterResult<T> = Result<T, AdapterError>

export type IntegrationEventStatus = 'succeeded' | 'failed' | 'pending'

export type IntegrationEventInput = {
  adapter: string
  eventType: string
  idempotencyKey: string
  status: IntegrationEventStatus
  simulation: boolean
  requestSummary?: unknown
  responseSummary?: unknown
  errorCode?: string
  errorMessage?: string
  relatedEntityType?: string
  relatedEntityId?: string
}

/** Injected into every simulated adapter so adapters stay unit-testable
 * (pass an in-memory recorder in tests) while still fulfilling the
 * "every adapter call is an audit-evidenced integration_events row"
 * contract in real use (wired to Supabase in src/lib/adapters/index.ts). */
export type IntegrationEventRecorder = (event: IntegrationEventInput) => Promise<void>

export const noopRecorder: IntegrationEventRecorder = async () => {}

export type IntegrationsMode = 'simulation' | 'live'
