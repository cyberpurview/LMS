import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const code = request.nextUrl.searchParams.get('code')
  const next = request.nextUrl.searchParams.get('next')
  const google = request.nextUrl.searchParams.get('provider') === 'google'
  function redirect(path: string) {
    const response = NextResponse.redirect(new URL(path, request.url))
    response.headers.set('Cache-Control', 'private, no-store')
    response.headers.set('Referrer-Policy', 'no-referrer')
    return response
  }
  if (google && request.nextUrl.searchParams.get('error')) {
    // Supabase also redirects provider/configuration failures here. Only a
    // plain access_denied response represents declined authorization.
    const denied = request.nextUrl.searchParams.get('error') === 'access_denied'
    const providerCode = request.nextUrl.searchParams.get('error_code')
    return redirect(
      denied && !providerCode ? '/login?error=oauth_cancelled' : '/login?error=oauth_provider',
    )
  }
  try {
    if (code) {
      const flowId = request.nextUrl.searchParams.get('sb_flow_id')
      if (
        code.length > 2048 ||
        /[\x00-\x1f\x7f]/.test(code) ||
        (flowId && (flowId.length > 256 || !/^[a-zA-Z0-9_-]+$/.test(flowId)))
      )
        return redirect('/login?error=oauth_session')
      const { data, error } = await (
        await createClient()
      ).auth.exchangeCodeForSession(code, flowId ? { flowId } : undefined)
      if (!error && data.session) {
        if (!google && next === '/reset-password') return redirect('/reset-password')
        const destination = new URL('/api/auth/destination', request.url)
        if (next) destination.searchParams.set('next', next)
        return redirect(destination.pathname + destination.search)
      }
    }
  } catch {
    // Expired codes and network failures return to the sign-in screen.
  }
  // Supabase can confirm the email before a PKCE exchange fails in another browser.
  return redirect(google ? '/login?error=oauth_session' : '/login?error=confirmation_session')
}
