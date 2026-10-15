import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'

const querySchema = z.object({
  cursor: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  q: z.string().trim().max(200).default(''),
  category: z.string().max(80).optional(),
})
export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success) return NextResponse.json({ error: 'Invalid query' }, { status: 400 })
  const { cursor, limit, q, category } = parsed.data
  const client = await createClient()
  let query = client
    .from('courses')
    .select(
      'id,slug,title,description,category,level,status,price,duration,thumbnail,tutor_id,created_at,updated_at',
    )
    .order('id')
    .limit(limit + 1)
  if (cursor) query = query.gt('id', cursor)
  if (category) query = query.eq('category', category)
  if (q) query = query.textSearch('search_document', q, { type: 'websearch', config: 'english' })
  const { data, error } = await query
  if (error) return NextResponse.json({ error: 'Unable to load courses' }, { status: 503 })
  const rows = data.slice(0, limit)
  return NextResponse.json(
    { data: rows, nextCursor: data.length > limit ? rows.at(-1)?.id : null },
    { headers: { 'Cache-Control': 'private, no-store' } },
  )
}
