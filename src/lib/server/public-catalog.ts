import 'server-only'
import { z } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from '@/lib/supabase/config'
import type { Database } from '@/types/database.types'
import { COURSE_BATCH_SIZE } from '@/lib/lms/course-browse'

export const catalogFilters = z.object({
  q: z.string().trim().max(200).default(''),
  category: z.string().max(80).default(''),
  level: z.enum(['', 'Beginner', 'Intermediate', 'Advanced']).default(''),
  cursor: z.string().uuid().optional(),
})
// Public discovery always uses the publishable key with no user session or service credentials.
function publicClient() {
  const { url, key } = supabaseConfig()
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
const cardColumns = 'id,slug,title,description,thumbnail,category,level,duration,price' as const
export async function publicCoursePage(filters: z.infer<typeof catalogFilters>) {
  const p = catalogFilters.parse(filters)
  let query = publicClient()
    .from('courses')
    .select(cardColumns)
    .eq('status', 'published')
    .order('id')
    .limit(COURSE_BATCH_SIZE + 1)
  if (p.q)
    query = query.textSearch('search_document', p.q, { type: 'websearch', config: 'english' })
  if (p.category) query = query.eq('category', p.category)
  if (p.level) query = query.eq('level', p.level)
  if (p.cursor) query = query.gt('id', p.cursor)
  const { data, error } = await query
  if (error) throw new Error('Unable to load courses. Please try again.')
  const courses = (data || []).slice(0, COURSE_BATCH_SIZE)
  return {
    courses,
    nextCursor: data && data.length > COURSE_BATCH_SIZE ? courses.at(-1)!.id : null,
  }
}
export async function publicCourse(slug: string) {
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || slug.length > 96) return null
  const { data, error } = await publicClient()
    .from('courses')
    .select(cardColumns)
    .eq('status', 'published')
    .eq('slug', slug)
    .maybeSingle()
  if (error) throw new Error('Unable to load this course. Please try again.')
  return data
}
