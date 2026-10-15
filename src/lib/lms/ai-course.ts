import { z } from 'zod'
export const aiOutlineSchema = z
  .object({
    description: z.string().trim().min(1).max(10000),
    objectives: z.array(z.string().trim().min(1).max(500)).min(1).max(10),
    modules: z
      .array(
        z.object({
          title: z.string().trim().min(1).max(200),
          lessons: z.array(z.string().trim().min(1).max(200)).min(1).max(4),
        }),
      )
      .min(1)
      .max(6),
  })
  .refine(
    (o) => o.modules.reduce((n, m) => n + m.lessons.length, 0) <= 24,
    'Use at most 24 lessons',
  )
export const aiSpecSchema = z.object({
  title: z.string().trim().min(1).max(160),
  audience: z.string().trim().max(500).default(''),
  goals: z.string().trim().max(1500).default(''),
  level: z.enum(['Beginner', 'Intermediate', 'Advanced']),
  category: z.string().trim().min(1).max(80),
  tutorId: z.string().uuid(),
  moduleCount: z.number().int().min(1).max(6),
  lessonsPerModule: z.number().int().min(1).max(4),
})
export const aiCommandSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('create'), id: z.string().uuid(), spec: aiSpecSchema }),
  z.object({ action: z.literal('approve'), id: z.string().uuid(), outline: aiOutlineSchema }),
  z.object({ action: z.enum(['cancel', 'retry']), id: z.string().uuid() }),
])
export type AiOutline = z.infer<typeof aiOutlineSchema>
export type AiSpec = z.infer<typeof aiSpecSchema>
export type AiJob = {
  id: string
  spec: AiSpec
  status:
    'outline_queued' | 'outlining' | 'review' | 'generating' | 'failed' | 'complete' | 'cancelled'
  outline: AiOutline | null
  courseId: string | null
  completed: number
  ready: number
  total: number
  error: string | null
  model: string | null
  createdAt: string
}
