import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuditEventInput = {
  actorId: string
  actorRole: string
  action: string
  entityType: string
  entityId: string
  reason?: string
  correlationId?: string
  beforeState?: unknown
  afterState?: unknown
}

/**
 * Writes one append-only audit_events row (ADR "audit by default"). No
 * update/delete policy exists on this table for any role (see
 * supabase/migrations/...audit.sql) — this function is the only sanctioned
 * way to create evidence, and it never mutates it afterwards.
 */
export async function writeAuditEvent(
  supabase: SupabaseClient,
  event: AuditEventInput,
): Promise<void> {
  const { error } = await supabase.from('audit_events').insert({
    actor_id: event.actorId,
    actor_role: event.actorRole,
    action: event.action,
    entity_type: event.entityType,
    entity_id: event.entityId,
    reason: event.reason,
    correlation_id: event.correlationId,
    before_state: event.beforeState,
    after_state: event.afterState,
  })

  if (error) {
    throw new Error(`Failed to write audit event "${event.action}": ${error.message}`)
  }
}
