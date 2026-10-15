import { NextResponse, type NextRequest } from 'next/server'
import { getIdentity } from '@/lib/server/auth'
import { safeWorkspacePath } from '@/lib/supabase/oauth'

export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentity()
    const destination = identity
      ? safeWorkspacePath(
          request.nextUrl.searchParams.get('next'),
          request.nextUrl.origin,
          identity.user.role,
        ) || `/${identity.user.role}`
      : '/login'
    return NextResponse.redirect(new URL(destination, request.url))
  } catch {
    return NextResponse.redirect(new URL('/login?error=setup', request.url))
  }
}
