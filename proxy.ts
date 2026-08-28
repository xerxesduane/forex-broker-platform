import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SUPABASE_ANON_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

/**
 * Route-protection boundary. Next.js 16 renamed `middleware.ts` to
 * `proxy.ts` (exported function `proxy`, Node runtime only) — see ADR
 * 0001. This refreshes the Supabase session cookie and redirects signed-
 * out visitors away from the client portal and admin portal. It is a
 * convenience layer, not the authorization boundary: every server
 * action/page still calls requirePermission / checks row ownership
 * itself (ADR 0004) — a bug here fails closed to a login redirect, never
 * open to unauthenticated data access.
 */
export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    return response
  }

  const supabase = createServerClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet) {
        for (const { name, value } of cookiesToSet) {
          request.cookies.set(name, value)
        }
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
      },
    },
  })

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const path = request.nextUrl.pathname
  const isPortalRoute = path.startsWith('/portal')
  const isAdminRoute = path.startsWith('/admin')

  if (!user && (isPortalRoute || isAdminRoute)) {
    const loginUrl = new URL('/login', request.url)
    loginUrl.searchParams.set('next', path)
    return NextResponse.redirect(loginUrl)
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Run on everything except static assets, so the session cookie stays
     * fresh across the whole app, while keeping the auth check itself
     * scoped to /portal and /admin above.
     */
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|webp)$).*)',
  ],
}
