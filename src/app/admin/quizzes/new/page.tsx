import { Suspense } from 'react'
import { QuizEditor } from '@/components/features/quizzes'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <QuizEditor role="admin" />
    </Suspense>
  )
}
