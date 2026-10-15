import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'
import { supabaseConfig } from '@/lib/supabase/config'

export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request })
  const { url, key } = supabaseConfig()
  const client = createServerClient(url, key, {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll(values) {
        values.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        values.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })
  // Signature/expiry verification here; layouts and RLS also check the live session and role.
  const { data } = await client.auth.getClaims()
  if (!data?.claims?.sub && /^\/(admin|tutor|learner)(\/|$)/.test(request.nextUrl.pathname)) {
    const target = new URL('/login', request.url)
    target.searchParams.set('next', request.nextUrl.pathname + request.nextUrl.search)
    const redirect = NextResponse.redirect(target)
    response.cookies.getAll().forEach((cookie) => redirect.cookies.set(cookie))
    redirect.headers.set('Cache-Control', 'private, no-store')
    return redirect
  }
  response.headers.set('Cache-Control', 'private, no-store')
  if (
    request.nextUrl.pathname.startsWith('/auth/') ||
    ['/login', '/reset-password'].includes(request.nextUrl.pathname)
  )
    response.headers.set('Referrer-Policy', 'no-referrer')
  return response
}

export const config = {
  matcher: [
    '/',
    '/admin/:path*',
    '/tutor/:path*',
    '/learner/:path*',
    '/api/:path*',
    '/auth/:path*',
    '/login',
    '/reset-password',
  ],
}
