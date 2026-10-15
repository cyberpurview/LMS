import { Suspense } from 'react'
import { QuizRunner } from '@/components/features/quizzes'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <QuizRunner id={(await params).id} />
    </Suspense>
  )
}
