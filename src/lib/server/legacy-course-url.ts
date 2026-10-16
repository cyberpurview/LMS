import 'server-only'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { COURSE_UUID, learnerCourseUrl } from '@/lib/lms/course-url'

/** Only legacy UUID requests need this lookup. RLS still controls course visibility. */
export async function redirectLegacyCourse(reference: string, suffix = '') {
  if (!COURSE_UUID.test(reference)) return
  const client = await createClient()
  const { data, error } = await client
    .from('courses')
    .select('id,slug')
    .eq('id', reference)
    .maybeSingle()
  if (error) throw new Error('Unable to open this course. Please try again.')
  if (data?.slug) redirect(learnerCourseUrl(data, suffix))
}
