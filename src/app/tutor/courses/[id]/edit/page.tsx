import { Suspense } from 'react'
import { CourseEditor } from '@/components/features/courses'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <CourseEditor role="tutor" id={(await params).id} />
    </Suspense>
  )
}
