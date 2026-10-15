import 'server-only'
import { createClient } from '@/lib/supabase/server'
import type { Course, Module } from '@/types'

export async function courseCategories() {
  const client = await createClient()
  const { data } = await client.from('categories').select('name').order('name')
  return (data || []).map((category) => category.name)
}

export async function publishedCourses() {
  const client = await createClient()
  const { data, error } = await client
    .from('courses')
    .select('*')
    .eq('status', 'published')
    .order('created_at', { ascending: false })
    .limit(12)
  if (error) return []
  const { data: details } = await client.rpc('course_outlines', {
    course_ids: data.map((c) => c.id),
  })
  const outlines =
    (details as unknown as { id: string; tutorName: string; modules: Module[] }[]) || []
  return data.map((c) => {
    const outline = outlines.find((x) => x.id === c.id)
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      thumbnail: c.thumbnail,
      tutorId: c.tutor_id,
      tutorName: outline?.tutorName || 'Instructor',
      tutorAvatar: '',
      category: c.category,
      level: c.level,
      status: c.status,
      price: Number(c.price),
      duration: Number(c.duration),
      requireAssessment: c.require_assessment,
      enrolledCount: 0,
      rating: 0,
      reviewCount: 0,
      tags: c.tags,
      modules: (outline?.modules || []).map((m) => ({
        ...m,
        lessons: m.lessons.map((l) => ({
          id: l.id,
          title: l.title,
          duration: l.duration,
          type: l.type,
        })),
      })),
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    } as Course
  })
}
