import type { QuizQuestion } from '@/types'
export function quizAnswerCacheKey(userId: string, attemptId: string) {
  return `cyberpurview:quiz:${userId}:${attemptId}`
}
export function restoreQuizAnswers(
  source: string | null,
  questions: QuizQuestion[],
): Record<string, string> {
  if (!source || source.length > 16384) return {}
  try {
    const value = JSON.parse(source)
    if (
      !value ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      Object.keys(value).length > 100
    )
      return {}
    const answers: Record<string, string> = {}
    for (const question of questions)
      if (
        typeof value[question.id] === 'string' &&
        question.options.some((o) => o.id === value[question.id])
      )
        answers[question.id] = value[question.id]
    return answers
  } catch {
    return {}
  }
}
export function remainingQuizSeconds(endAt: number, now: number) {
  return Math.max(0, Math.ceil((endAt - now) / 1000))
}
