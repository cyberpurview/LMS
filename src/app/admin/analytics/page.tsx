import { Suspense } from 'react'
import { Analytics } from '@/components/features/analytics'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <Analytics role="admin" />
    </Suspense>
  )
}
