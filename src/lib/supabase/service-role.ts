import 'server-only'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

/**
 * Elevated, RLS-bypassing client for trusted server-only system actions
 * (e.g. writing the result of a completed MT5 provisioning, system
 * notifications). The `server-only` import makes bundling this into a
 * Client Component a build error, not just a lint warning — the service
 * role key must never reach the browser (security baseline).
 *
 * Every call site using this client MUST have already performed its own
 * `requirePermission(...)` / ownership check — this client does not do
 * that for you.
 */
export function createSupabaseServiceRoleClient() {
  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    throw new Error(
      'Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY. Copy .env.example to .env.local.',
    )
  }
  return createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false },
  })
}
