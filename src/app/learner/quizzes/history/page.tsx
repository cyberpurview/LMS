import { Suspense } from 'react'
import { QuizHistory } from '@/components/features/quiz-history'
export default function Page() {
  return (
    <Suspense>
      <QuizHistory />
    </Suspense>
  )
}
