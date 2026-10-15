import { Suspense } from 'react'
import { Help } from '@/components/features/account'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <Help role="tutor" />
    </Suspense>
  )
}
