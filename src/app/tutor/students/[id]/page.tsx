import { Suspense } from 'react'
import { StudentDetail } from '@/components/features/people'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <StudentDetail id={(await params).id} />
    </Suspense>
  )
}
