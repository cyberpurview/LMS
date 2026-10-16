import { NextRequest, NextResponse } from 'next/server'
import { getIdentity } from '@/lib/server/auth'
export async function GET(request: NextRequest) {
  const identity = await getIdentity()
  if (!identity || identity.user.role !== 'admin')
    return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
  const page = Number(request.nextUrl.searchParams.get('page') || 0)
  if (!Number.isInteger(page) || page < 0 || page > 10000)
    return NextResponse.json({ error: 'Invalid page' }, { status: 400 })
  const { data, error } = await identity.client
    .from('support_tickets')
    .select('*')
    .order('created_at', { ascending: false })
    .range(page * 25, page * 25 + 25)
  if (error) return NextResponse.json({ error: error.message }, { status: 503 })
  return NextResponse.json(
    { tickets: data.slice(0, 25), hasMore: data.length > 25 },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
