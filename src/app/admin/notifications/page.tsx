import { Suspense } from 'react'
import { Notifications } from '@/components/features/account'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <Notifications role="admin" />
    </Suspense>
  )
}
