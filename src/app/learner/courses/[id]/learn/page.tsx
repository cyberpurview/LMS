import { Suspense } from 'react'
import { CoursePlayer } from '@/components/features/courses'
import { redirectLegacyCourse } from '@/lib/server/legacy-course-url'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await redirectLegacyCourse(id, '/learn')
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <CoursePlayer id={id} />
    </Suspense>
  )
}
