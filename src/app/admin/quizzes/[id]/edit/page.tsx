import { Suspense } from 'react'
import { QuizEditor } from '@/components/features/quizzes'
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<div className="p-8 text-slate-500">Loading workspace…</div>}>
      <QuizEditor key={(await params).id} role="admin" id={(await params).id} />
    </Suspense>
  )
}
