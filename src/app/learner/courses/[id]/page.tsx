import { Suspense } from 'react'
import { CourseDetail } from '@/components/features/courses'
import { redirectLegacyCourse } from '@/lib/server/legacy-course-url'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  await redirectLegacyCourse(id)
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <CourseDetail role="learner" id={id} />
    </Suspense>
  )
}
