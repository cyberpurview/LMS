import { Suspense } from 'react'
import { People } from '@/components/features/people'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <People role="tutor" />
    </Suspense>
  )
}
