import { NextRequest, NextResponse } from 'next/server'
import { getIdentity } from '@/lib/server/auth'
import { loadWorkspace } from '@/lib/server/workspace'

export async function GET(request: NextRequest) {
  try {
    const identity = await getIdentity()
    if (!identity) return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
    const page = Number(request.nextUrl.searchParams.get('page') || 0)
    if (!Number.isInteger(page) || page < 0 || page > 10000)
      return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
    return NextResponse.json(
      await loadWorkspace(
        identity.client,
        identity.user,
        page,
        request.nextUrl.searchParams.get('focus') || '',
      ),
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Unable to load workspace' },
      { status: 503 },
    )
  }
}
