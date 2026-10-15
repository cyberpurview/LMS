import { Suspense } from 'react'
import { QuizList } from '@/components/features/quizzes'
export default function Page() {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <QuizList role="admin" />
    </Suspense>
  )
}
