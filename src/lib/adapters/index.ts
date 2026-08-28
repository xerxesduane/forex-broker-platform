import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import { SupabaseDocumentStorageAdapter } from './document-storage/simulated'
import { SimulatedEmailAdapter } from './email/simulated'
import { SimulatedKycProviderAdapter } from './kyc-provider/simulated'
import { SimulatedMt5Adapter } from './mt5/simulated'
import { SimulatedPaymentsAdapter } from './payments/simulated'
import { SimulatedSmsAdapter } from './sms/simulated'
import type { IntegrationEventRecorder, IntegrationsMode } from './shared/types'

export const INTEGRATIONS_MODE: IntegrationsMode =
  process.env.INTEGRATIONS_MODE === 'live' ? 'live' : 'simulation'

/**
 * Adapter factory (ADR 0005). Only `simulation` is implemented — this
 * build intentionally has no `live` branch to accidentally fall into.
 * Pass the request-scoped Supabase server client (not the browser client)
 * so integration_events rows are attributed to the acting session.
 */
export function createAdapters(supabase: SupabaseClient) {
  if (INTEGRATIONS_MODE !== 'simulation') {
    throw new Error(
      'INTEGRATIONS_MODE must be "simulation" in this build — no live adapter is implemented (ADR 0005).',
    )
  }

  const recordEvent: IntegrationEventRecorder = async (event) => {
    const { error } = await supabase.from('integration_events').insert({
      adapter: event.adapter,
      event_type: event.eventType,
      idempotency_key: event.idempotencyKey,
      status: event.status,
      simulation: event.simulation,
      request_summary: event.requestSummary ?? null,
      response_summary: event.responseSummary ?? null,
      error_code: event.errorCode ?? null,
      error_message: event.errorMessage ?? null,
      related_entity_type: event.relatedEntityType ?? null,
      related_entity_id: event.relatedEntityId ?? null,
      completed_at: new Date().toISOString(),
    })
    if (error) {
      // Don't let a logging failure look like a successful integration
      // call — but don't throw either, since the primary adapter result
      // has already been decided. Surface loudly instead.
      console.error(
        `Failed to record integration_event for ${event.adapter}/${event.eventType}:`,
        error,
      )
    }
  }

  return {
    mt5: new SimulatedMt5Adapter(recordEvent),
    kycProvider: new SimulatedKycProviderAdapter(recordEvent),
    documentStorage: new SupabaseDocumentStorageAdapter(supabase, recordEvent),
    payments: new SimulatedPaymentsAdapter(recordEvent),
    email: new SimulatedEmailAdapter(recordEvent),
    sms: new SimulatedSmsAdapter(recordEvent),
  }
}
