import { NextRequest, NextResponse } from 'next/server'
import { createClient as createAdminClient } from '@supabase/supabase-js'
import { getIdentity } from '@/lib/server/auth'
import { commandSchema } from '@/lib/lms/commands'
import { supabaseConfig } from '@/lib/supabase/config'
import { storageAdmin } from '@/lib/server/storage'
import { THUMBNAIL_BUCKET } from '@/lib/lms/thumbnail'
import { safeLessonContent } from '@/lib/lms/rich-text'
import { readBoundedText, RequestBodyTooLarge } from '@/lib/server/request-body'
import { cleanupCourseResources } from '@/lib/server/course-resource-cleanup'

export async function POST(request: NextRequest) {
  // Cookie-authenticated writes must originate from this application.
  const originHeader = request.headers.get('origin')
  try {
    const origin = new URL(originHeader || '')
    if (
      origin.origin !== originHeader ||
      origin.host !== (request.headers.get('host') || request.nextUrl.host) ||
      !['http:', 'https:'].includes(origin.protocol) ||
      (process.env.NODE_ENV === 'production' && origin.protocol !== 'https:') ||
      request.headers.get('sec-fetch-site') === 'cross-site'
    )
      return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  } catch {
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  }
  if (Number(request.headers.get('content-length') || 0) > 524288)
    return NextResponse.json({ error: 'Request too large' }, { status: 413 })
  try {
    const identity = await getIdentity()
    if (!identity) return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
    const raw = await readBoundedText(request, 524288)
    const parsed = commandSchema.safeParse(JSON.parse(raw))
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || 'Invalid input' },
        { status: 400 },
      )
    const command = parsed.data
    const { client, user } = identity
    let result
    switch (command.type) {
      case 'award':
        result = await client.rpc('award_action', {
          action: command.action,
          kind: command.kind,
          subject_id: command.subjectId,
          learner_id: command.learnerId,
        })
        break
      case 'category':
        if (user.role !== 'admin')
          return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
        result = await client.rpc('lms_command', { command: 'category', payload: command })
        break
      case 'enroll':
        result = await client.rpc('enroll_course', { course_id: command.courseId })
        break
      case 'claimCertificate':
        result = await client.rpc('claim_course_certificate', { course_id: command.courseId })
        break
      case 'complete':
        result = await client.rpc('complete_lesson', { lesson_id: command.lessonId })
        break
      case 'startQuiz':
        result = await client.rpc('start_quiz', { quiz_id: command.quizId })
        break
      case 'quizResult':
        result = await client.rpc('quiz_result', { quiz_id: command.quizId })
        break
      case 'quizHistory':
        result = await client.rpc('learner_quiz_history', {
          filter_quiz: command.quizId,
          after_attempt: command.afterId,
        })
        break
      case 'quizAttemptResult':
        result = await client.rpc('learner_quiz_attempt', { requested_attempt: command.attemptId })
        break
      case 'quizAttempts':
        result = await client.rpc('quiz_attempt_action', {
          action: command.action,
          quiz_id: command.quizId,
          request_id: command.requestId,
          after_id: command.afterId,
          learner_id: command.learnerId,
          extra: command.extra,
          reason: command.reason,
        })
        break
      case 'submitQuiz':
        result = await client.rpc('submit_quiz', {
          attempt_id: command.attemptId,
          answers: command.answers,
        })
        break
      case 'invite': {
        if (user.role !== 'admin')
          return NextResponse.json({ error: 'Administrator access required' }, { status: 403 })
        const secret = process.env.SUPABASE_SECRET_KEY
        if (!secret)
          return NextResponse.json(
            {
              error: 'Account creation is unavailable. Please contact the platform administrator.',
            },
            { status: 503 },
          )
        const { url } = supabaseConfig()
        const admin = createAdminClient(url, secret, {
          auth: { persistSession: false, autoRefreshToken: false },
        })
        const email = command.email.trim().toLowerCase()
        const { data: existing, error: lookupError } = await client
          .from('profiles')
          .select('id')
          .eq('email', email)
          .maybeSingle()
        if (lookupError) throw new Error('Unable to check this email. Please try again.')
        if (existing)
          return NextResponse.json(
            { error: 'An account with this email already exists. Edit that account instead.' },
            { status: 409 },
          )
        // Generate a single-use setup link without relying on the hosted SMTP service.
        const invitation = await admin.auth.admin.generateLink({
          type: 'invite',
          email,
          options: {
            data: { name: command.name },
            redirectTo: `${request.nextUrl.origin}/auth/confirm`,
          },
        })
        if (invitation.error) {
          return NextResponse.json({ error: invitation.error.message }, { status: 400 })
        }
        if (!invitation.data.user || !invitation.data.properties?.hashed_token)
          throw new Error('The account setup link could not be generated. Please try again.')
        const assigned = await client.rpc('lms_command', {
          command: 'profile',
          payload: {
            id: invitation.data.user.id,
            name: command.name,
            role: command.role,
            isActive: true,
          },
        })
        if (assigned.error)
          throw new Error(
            'The account was created, but its role could not be saved. Refresh the user list and edit the account before issuing a setup link.',
          )
        const activation = new URL('/auth/confirm', request.nextUrl.origin)
        activation.searchParams.set('token_hash', invitation.data.properties.hashed_token)
        activation.searchParams.set('type', 'invite')
        return NextResponse.json(
          { data: { activationLink: activation.toString(), id: invitation.data.user.id } },
          { headers: { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' } },
        )
      }
      case 'profile': {
        // A profile update must never change the account's sign-in email.
        const { data: target, error: targetError } = await client
          .from('profiles')
          .select('email')
          .eq('id', command.user.id)
          .single()
        if (targetError) throw targetError
        if (command.user.email !== target.email) {
          return NextResponse.json(
            { error: 'Your sign-in email cannot be changed.' },
            { status: 403 },
          )
        }
        result = await client.rpc('lms_command', { command: 'profile', payload: command.user })
        break
      }
      case 'saveCourse': {
        if (!['admin', 'tutor'].includes(user.role))
          return NextResponse.json({ error: 'Course management access required' }, { status: 403 })
        if (command.course.thumbnail) {
          const prefix = `${supabaseConfig().url.replace(/\/$/, '')}/storage/v1/object/public/${THUMBNAIL_BUCKET}/`
          const path = command.course.thumbnail.startsWith(prefix)
            ? command.course.thumbnail.slice(prefix.length)
            : ''
          const folders = path.split('/')
          if (
            folders.length !== 3 ||
            folders[1] !== command.course.id ||
            !/^[0-9a-f-]{36}$/.test(folders[0]) ||
            !/^[0-9a-f-]{36}\.webp$/.test(folders[2])
          )
            throw new Error('Upload a 16:9 thumbnail using the course editor.')
          const image = await storageAdmin().storage.from(THUMBNAIL_BUCKET).info(path)
          if (image.error || !image.data)
            throw new Error('The thumbnail is unavailable. Upload it again before saving.')
        }
        result = await client.rpc('save_course_with_revision', {
          payload: {
            ...command.course,
            modules: command.course.modules.map((m) => ({
              ...m,
              lessons: m.lessons.map((l) => ({ ...l, content: safeLessonContent(l.content) })),
            })),
          },
        })
        break
      }
      case 'saveQuiz': {
        if (!['admin', 'tutor'].includes(user.role))
          return NextResponse.json({ error: 'Quiz management access required' }, { status: 403 })
        let thumbnailPath = ''
        if (command.quiz.thumbnail) {
          const prefix = `${supabaseConfig().url.replace(/\/$/, '')}/storage/v1/object/public/${THUMBNAIL_BUCKET}/`
          thumbnailPath = command.quiz.thumbnail.startsWith(prefix)
            ? command.quiz.thumbnail.slice(prefix.length)
            : ''
          const folders = thumbnailPath.split('/')
          if (
            folders.length !== 3 ||
            folders[1] !== (command.quiz.courseId || command.quiz.id) ||
            !/^[0-9a-f-]{36}$/.test(folders[0]) ||
            !/^[0-9a-f-]{36}\.webp$/.test(folders[2])
          )
            throw new Error('Upload a 16:9 thumbnail for this quiz’s course.')
          const image = await storageAdmin().storage.from(THUMBNAIL_BUCKET).info(thumbnailPath)
          if (image.error || !image.data)
            throw new Error('The quiz thumbnail is unavailable. Upload it again.')
        }
        result = await client.rpc('lms_command', {
          command: command.type,
          payload: { ...command.quiz, courseId: command.quiz.courseId || null, thumbnailPath },
        })
        break
      }
      case 'preferences':
        result = await client.rpc('lms_command', {
          command: command.type,
          payload: command.preferences,
        })
        break
      default:
        result = await client.rpc('lms_command', { command: command.type, payload: command })
    }
    if (result?.error)
      return NextResponse.json(
        { error: result.error.message },
        {
          status:
            result.error.code === '42501'
              ? 403
              : result.error.message.startsWith('Too many')
                ? 429
                : 400,
        },
      )
    if (command.type === 'saveCourse') await cleanupCourseResources().catch(() => {})
    return NextResponse.json(
      { data: result?.data },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Request failed' },
      { status: error instanceof RequestBodyTooLarge ? 413 : 400 },
    )
  }
}
