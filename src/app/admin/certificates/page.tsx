import { Suspense } from 'react'
import { Certificates } from '@/components/features/certificates'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <Certificates role="admin" />
    </Suspense>
  )
}
