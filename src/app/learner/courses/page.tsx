import { Suspense } from 'react'
import { CourseList } from '@/components/features/courses'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <CourseList role="learner" />
    </Suspense>
  )
}
