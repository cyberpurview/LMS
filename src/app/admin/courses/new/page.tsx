import { Suspense } from 'react'
import { CourseEditor } from '@/components/features/courses'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <CourseEditor role="admin" />
    </Suspense>
  )
}
