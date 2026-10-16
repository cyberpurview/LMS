import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getIdentity } from '@/lib/server/auth'
import { COURSE_BATCH_SIZE } from '@/lib/lms/course-browse'
const schema = z.object({
  mode: z.enum(['catalog', 'mine', 'managed']),
  cursor: z.string().uuid().optional(),
  q: z.string().trim().max(200).default(''),
  category: z.string().max(80).default(''),
  level: z.enum(['', 'Beginner', 'Intermediate', 'Advanced']).default(''),
  state: z.enum(['', 'published', 'draft', 'archived', 'completed', 'ongoing']).default(''),
})
export async function GET(request: NextRequest) {
  const headers = { 'Cache-Control': 'private, no-store' }
  const parsed = schema.safeParse(Object.fromEntries(request.nextUrl.searchParams))
  if (!parsed.success)
    return NextResponse.json({ error: 'Invalid course filters' }, { status: 400, headers })
  try {
    const identity = await getIdentity()
    if (!identity) return NextResponse.json({ error: 'Please sign in' }, { status: 401, headers })
    const p = parsed.data
    const { data, error } = await identity.client.rpc('browse_courses', {
      mode: p.mode,
      after_id: p.cursor,
      page_size: COURSE_BATCH_SIZE,
      search: p.q,
      category_filter: p.category,
      level_filter: p.level,
      state_filter: p.state,
    })
    if (error)
      return NextResponse.json(
        { error: 'Unable to load courses. Please try again.' },
        { status: error.code === '42501' ? 403 : 503, headers },
      )
    return NextResponse.json(data, { headers })
  } catch {
    return NextResponse.json(
      { error: 'Unable to load courses. Please try again.' },
      { status: 503, headers },
    )
  }
}
