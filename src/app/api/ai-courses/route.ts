import { NextRequest, NextResponse } from 'next/server'
import { getIdentity } from '@/lib/server/auth'
import { aiCommandSchema } from '@/lib/lms/ai-course'
import { readBoundedText, RequestBodyTooLarge } from '@/lib/server/request-body'
import type { Json } from '@/types/database.types'
const headers = { 'Cache-Control': 'private, no-store' }
export async function GET() {
  try {
    const identity = await getIdentity()
    if (!identity)
      return NextResponse.json(
        { error: 'Your session has expired. Please sign in again.' },
        { status: 401, headers },
      )
    if (!['admin', 'tutor'].includes(identity.user.role))
      return NextResponse.json(
        { error: 'Course creator access required' },
        { status: 403, headers },
      )
    const { data, error } = await identity.client.rpc('ai_course_command', {
      action: 'list',
      payload: {},
    })
    if (error)
      return NextResponse.json(
        { error: 'Unable to load generation history.' },
        { status: 503, headers },
      )
    return NextResponse.json(
      { jobs: data, available: !!process.env.GROQ_API_KEY && !!process.env.GROQ_MODEL },
      { headers },
    )
  } catch {
    return NextResponse.json(
      { error: 'Unable to load generation history.' },
      { status: 503, headers },
    )
  }
}
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers })
  try {
    const identity = await getIdentity()
    if (!identity)
      return NextResponse.json(
        { error: 'Your session has expired. Please sign in again.' },
        { status: 401, headers },
      )
    if (!['admin', 'tutor'].includes(identity.user.role))
      return NextResponse.json(
        { error: 'Course creator access required' },
        { status: 403, headers },
      )
    const parsed = aiCommandSchema.safeParse(JSON.parse(await readBoundedText(request, 50000)))
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid request' },
        { status: 400, headers },
      )
    if (parsed.data.action !== 'cancel' && (!process.env.GROQ_API_KEY || !process.env.GROQ_MODEL))
      return NextResponse.json(
        { error: 'AI generation is not configured.' },
        { status: 503, headers },
      )
    const command = parsed.data
    const { data, error } = await identity.client.rpc('ai_course_command', {
      action: command.action,
      payload: command as unknown as Json,
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 400, headers })
    return NextResponse.json({ job: data }, { headers })
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to process this generation request.' },
      { status: error instanceof RequestBodyTooLarge ? 413 : 400, headers },
    )
  }
}
