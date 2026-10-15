import { Suspense } from 'react'
import { Settings } from '@/components/features/account'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <Settings role="admin" />
    </Suspense>
  )
}
