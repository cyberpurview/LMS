import { z } from 'zod'
import { quizQuestionSchema } from './commands'
import type { QuizQuestion } from '@/types'

export const QUIZ_IMPORT_MAX_BYTES = 256 * 1024
export const QUIZ_MAX_QUESTIONS = 100
export const quizImportExample = {
  questions: [
    {
      text: 'Which control provides an additional layer of account protection?',
      options: ['Multi-factor authentication', 'Sharing passwords', 'Disabling audit logs'],
      correctAnswer: 1,
      explanation: 'Multi-factor authentication requires an additional verification factor.',
    },
  ],
}
const importedQuestion = z
  .object({
    text: z.string().trim().min(1).max(2000),
    options: z.array(z.string().trim().min(1).max(1000)).min(2).max(10),
    correctAnswer: z.number().int().min(1),
    explanation: z.string().max(5000).optional(),
  })
  .strict()
  .superRefine((q, ctx) => {
    if (q.correctAnswer > q.options.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['correctAnswer'],
        message: 'Choose an option number from 1 to the number of options.',
      })
  })

export function parseQuizImport(
  source: string,
  makeId: () => string = () => crypto.randomUUID(),
): QuizQuestion[] {
  if (new TextEncoder().encode(source).byteLength > QUIZ_IMPORT_MAX_BYTES)
    throw new Error('Use a JSON file no larger than 256 KB.')
  let value: unknown
  try {
    value = JSON.parse(source.replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('Invalid JSON. Check commas, quotes and brackets, or use the sample file.')
  }
  const root = z
    .union([
      z.array(z.unknown()),
      z
        .object({ questions: z.array(z.unknown()) })
        .strict()
        .transform((v) => v.questions),
    ])
    .safeParse(value)
  if (!root.success)
    throw new Error('Use an object with a "questions" array, or a JSON array of questions.')
  if (!root.data.length || root.data.length > QUIZ_MAX_QUESTIONS)
    throw new Error('Import between 1 and 100 questions.')
  // Validate the entire file before generating IDs or changing the editor.
  const validated = root.data.map((item, index) => {
    const result = importedQuestion.safeParse(item)
    if (!result.success) {
      const issue = result.error.issues[0]
      const field = issue.path.map((p) => (typeof p === 'number' ? p + 1 : p)).join('.')
      throw new Error(`Question ${index + 1}${field ? ` (${field})` : ''}: ${issue.message}`)
    }
    return result.data
  })
  return validated.map((q) => {
    const options = q.options.map((text) => ({ id: makeId(), text }))
    return quizQuestionSchema.parse({
      id: makeId(),
      text: q.text,
      options,
      correctOptionId: options[q.correctAnswer - 1].id,
      explanation: q.explanation,
    })
  })
}
