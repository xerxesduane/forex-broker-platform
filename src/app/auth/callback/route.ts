import { NextResponse } from 'next/server'
import { createSupabaseServerClient } from '@/lib/supabase/server'

/**
 * Supabase email-confirmation callback (PKCE flow): exchanges the `code`
 * query param for a session, then redirects on. Next.js 16: route handler
 * params/searchParams patterns are unaffected by the async-request-API
 * change (that applies to page/layout params, not NextRequest), but we
 * still read everything from the request URL rather than any cached value.
 */
export async function GET(request: Request) {
  const url = new URL(request.url)
  const code = url.searchParams.get('code')
  const next = url.searchParams.get('next') ?? '/portal'

  if (code) {
    const supabase = await createSupabaseServerClient()
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (!error) {
      return NextResponse.redirect(new URL(next, url.origin))
    }
  }

  return NextResponse.redirect(new URL('/login?error=verification_failed', url.origin))
}
