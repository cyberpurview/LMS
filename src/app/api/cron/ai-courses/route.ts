import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { storageAdmin } from '@/lib/server/storage'
import { generateAiOutline, generateAiLesson, AiProviderError } from '@/lib/server/ai-provider'
import type { AiOutline, AiSpec } from '@/lib/lms/ai-course'
import type { Json } from '@/types/database.types'
export const runtime = 'nodejs'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  const expected = Buffer.from(`Bearer ${process.env.CRON_SECRET || ''}`),
    supplied = Buffer.from(request.headers.get('authorization') || '')
  if (
    !process.env.CRON_SECRET ||
    expected.length !== supplied.length ||
    !timingSafeEqual(expected, supplied)
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const model = process.env.GROQ_MODEL
  if (!model || !process.env.GROQ_API_KEY)
    return NextResponse.json({ error: 'AI generation is not configured' }, { status: 503 })
  const client = storageAdmin(10000)
  const budget = Number(process.env.AI_DAILY_REQUEST_LIMIT || 100)
  if (!Number.isInteger(budget) || budget < 1 || budget > 10000)
    return NextResponse.json({ error: 'Invalid AI request budget' }, { status: 503 })
  const { data, error } = await client.rpc('claim_ai_course_work', {
    model_name: model,
    daily_request_limit: budget,
  })
  if (error) return NextResponse.json({ error: 'Unable to claim generation work' }, { status: 503 })
  if (!data) return NextResponse.json({ processed: 0 })
  const job = data as unknown as {
    id: string
    lease_token: string
    model: string
    spec: AiSpec
    outline: AiOutline
    course_id: string | null
    completed: number
    plan: { title: string; moduleTitle: string }[]
  }
  let result: Json = null,
    failure: string | null = null,
    permanent = false
  try {
    result = job.course_id
      ? {
          content: await generateAiLesson(
            job.model,
            job.spec,
            job.outline,
            job.plan[job.completed],
          ),
        }
      : ((await generateAiOutline(job.model, job.spec)) as unknown as Json)
  } catch (error) {
    failure =
      error instanceof AiProviderError
        ? error.message
        : 'Unable to generate this content. Your progress is saved.'
    permanent = error instanceof AiProviderError && error.permanent
  }
  const finished = await client.rpc('finish_ai_course_work', {
    job_id: job.id,
    lease: job.lease_token,
    result,
    error_message: failure,
    permanent,
  })
  if (finished.error)
    return NextResponse.json(
      { error: 'Unable to save generation progress. The lease will recover automatically.' },
      { status: 503 },
    )
  return NextResponse.json({ processed: 1, failed: !!failure })
}
