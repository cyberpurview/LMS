import 'server-only'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database.types'
import type { User, Course, Module, Quiz, QuizQuestion, Notification } from '@/types'
import { emptyState, type LmsState, type WorkspaceSummary } from '@/lib/lms/state'
import { supabaseConfig } from '@/lib/supabase/config'
import { THUMBNAIL_BUCKET } from '@/lib/lms/thumbnail'

const PAGE_SIZE = 50
export async function loadWorkspace(
  client: SupabaseClient<Database>,
  user: User,
  page = 0,
  focus = '',
) {
  const slugFocus = focus.match(/^\/learner\/courses\/([a-z0-9]+(?:-[a-z0-9]+)*)(\/learn)?\/?$/)
  if (
    slugFocus &&
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/.test(slugFocus[1])
  ) {
    // One indexed, RLS-protected lookup; every subsequent query still uses the UUID.
    if (slugFocus[1].length > 96) throw new Error('Invalid course URL.')
    const { data, error } = await client
      .from('courses')
      .select('id')
      .eq('slug', slugFocus[1])
      .maybeSingle()
    if (error) throw new Error('Unable to open this course.')
    if (!data) {
      const state: LmsState = structuredClone(emptyState)
      state.users = [user]
      return { state, hasMore: false, page: 0 }
    }
    focus = `/learner/courses/${data.id}${slugFocus[2] || ''}`
  }
  if (/^\/(?:learner\/catalog|(?:admin|tutor|learner)\/courses)\/?$/.test(focus)) {
    const [categories, settings, feed] = await Promise.all([
      client.from('categories').select('name').order('name'),
      client.from('platform_settings').select('platform_name').single(),
      client.rpc('notification_feed', {}),
    ])
    if (categories.error || settings.error || feed.error)
      throw new Error('Unable to load your workspace.')
    const state: LmsState = structuredClone(emptyState)
    state.users = [user]
    state.categories = (categories.data || []).map((c) => c.name)
    state.platformName = settings.data?.platform_name || emptyState.platformName
    const notifications = feed.data as unknown as {
      notifications: {
        id: string
        user_id: string
        title: string
        message: string
        type: Notification['type']
        is_read: boolean
        created_at: string
        href: string
      }[]
      unreadCount: number
    }
    state.notifications = notifications.notifications.slice(0, 50).map((n) => ({
      id: n.id,
      userId: n.user_id,
      title: n.title,
      message: n.message,
      type: n.type,
      isRead: n.is_read,
      createdAt: n.created_at,
      href: n.href,
    }))
    state.unreadNotifications = notifications.unreadCount
    return { state, hasMore: false, page: 0 }
  }
  const section = focus.split('/')[2] || ''
  const match = focus.match(
    /^\/(?:admin|tutor|learner)\/(courses|quizzes)\/([0-9a-f-]{36})(?:\/|$)/,
  )
  const dashboard = !section || section === 'analytics'
  const people = section === 'users' || section === 'students'
  const quizPage = section === 'quizzes' && !focus.endsWith('/history')
  const coursePage = section === 'courses'
  const creating = focus.endsWith('/new') || focus.endsWith('/courses/ai')
  const courseDetail = match?.[1] === 'courses'
  const quizDetail = match?.[1] === 'quizzes'
  const needCourses = dashboard || people || courseDetail || (creating && quizPage)
  const needProfiles =
    dashboard ||
    people ||
    section === 'settings' ||
    (creating && coursePage && user.role === 'admin') ||
    (quizPage && !match && !creating && user.role !== 'learner')
  const needEnrollments = dashboard || people || courseDetail || (quizPage && !match && !creating)
  const needQuizzes = dashboard || people || courseDetail || (quizPage && !creating)
  const needAttempts =
    dashboard || people || (quizPage && !match && !creating && user.role !== 'learner')
  const needCertificates =
    dashboard || section === 'certificates' || (quizDetail && user.role === 'learner')
  const none = () => Promise.resolve({ data: [], error: null })
  const start = page * PAGE_SIZE
  const queries = await Promise.all([
    needCourses
      ? (courseDetail
          ? client.from('courses').select('*').eq('id', match![2])
          : client.from('courses').select('*').order('id')
        ).range(start, start + PAGE_SIZE)
      : none(),
    needProfiles
      ? (section === 'settings'
          ? client.from('profiles').select('*').eq('id', user.id)
          : client.from('profiles').select('*').order('id')
        ).range(start, start + PAGE_SIZE)
      : none(),
    needEnrollments
      ? (courseDetail
          ? client.from('enrollments').select('*').eq('course_id', match![2])
          : client.from('enrollments').select('*').order('id')
        ).range(start, start + PAGE_SIZE)
      : none(),
    needQuizzes
      ? (quizDetail
          ? client.from('quizzes').select('*').eq('id', match![2])
          : courseDetail
            ? client.from('quizzes').select('*').eq('course_id', match![2])
            : client.from('quizzes').select('*').order('id')
        ).range(start, start + PAGE_SIZE)
      : none(),
    needAttempts
      ? client
          .from('quiz_attempts')
          .select('*')
          .order('id')
          .range(start, start + PAGE_SIZE)
      : none(),
    needCertificates
      ? (quizDetail
          ? client.from('certificates').select('*').eq('quiz_id', match![2])
          : client.from('certificates').select('*').order('id')
        ).range(start, start + PAGE_SIZE)
      : none(),
    client
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE),
    none(), // Progress comes from enrollment_summaries, never a bulk progress read.
    none(), // Lesson notes are fetched only for the focused course below.
    client.from('notifications').select('id', { count: 'exact', head: true }).eq('is_read', false),
  ])
  const failed = queries.find((q) => q.error)
  if (failed?.error) throw new Error(failed.error.message)
  const courseRows = queries[0].data || []
  const profileRows = queries[1].data || []
  const enrollmentRows = queries[2].data || []
  const quizRows = queries[3].data || []
  const attemptRows = queries[4].data || []
  const certificateRows = queries[5].data || []
  const notificationRows = queries[6].data || []
  let focusedQuiz
  let focusedCourse
  if (match) {
    if (match[1] === 'quizzes') {
      focusedQuiz = quizRows[0]
    }
    if (match[1] === 'courses' || focusedQuiz?.course_id) {
      if (courseDetail) focusedCourse = courseRows[0]
      else {
        const { data, error } = await client
          .from('courses')
          .select('*')
          .eq('id', focusedQuiz?.course_id || match[2])
          .maybeSingle()
        focusedCourse = data
        if (error) throw new Error('Unable to load assessment course.')
      }
    }
  }
  const hasMore = queries.some((q) => (q.data?.length || 0) > PAGE_SIZE)
  const clip = <T>(items: T[]) => items.slice(0, PAGE_SIZE)
  const state: LmsState = structuredClone(emptyState)
  state.users = clip(profileRows).map((p) => ({
    id: p.id,
    name: p.name,
    email: p.email,
    role: p.role,
    avatar: p.avatar,
    joinedAt: p.created_at,
    isActive: p.is_active,
  }))
  if (!state.users.some((p) => p.id === user.id)) state.users.push(user)
  const selectedCourses = clip(courseRows)
  if (focusedCourse && !selectedCourses.some((c) => c.id === focusedCourse.id))
    selectedCourses.push(focusedCourse)
  const selectedQuizzes = clip(quizRows)
  if (focusedQuiz && !selectedQuizzes.some((q) => q.id === focusedQuiz.id))
    selectedQuizzes.push(focusedQuiz)
  if (focusedCourse) {
    if (courseDetail) {
      const { data: courseQuizzes, error: courseQuizError } = await client
        .from('quizzes')
        .select('*')
        .eq('course_id', focusedCourse.id)
        .order('id')
        .limit(100)
      if (courseQuizError) throw new Error(courseQuizError.message)
      for (const q of courseQuizzes || [])
        if (!selectedQuizzes.some((x) => x.id === q.id)) selectedQuizzes.push(q)
    }
    if (quizDetail && user.role === 'learner') {
      const { data, error } = await client
        .from('enrollments')
        .select('*')
        .eq('course_id', focusedCourse.id)
        .eq('learner_id', user.id)
        .maybeSingle()
      if (data && !enrollmentRows.some((e) => e.id === data.id)) enrollmentRows.unshift(data)
      if (error) throw new Error('Unable to load enrollment.')
    }
  }
  // Quiz and course pages are independent; include their parent courses in one bounded query.
  const missingCourseIds = [...new Set(selectedQuizzes.map((q) => q.course_id))].filter(
    (id): id is string => !!id && !selectedCourses.some((c) => c.id === id),
  )
  if (missingCourseIds.length) {
    const { data, error } = await client.from('courses').select('*').in('id', missingCourseIds)
    if (error) throw new Error('Unable to load assessment courses.')
    selectedCourses.push(...(data || []))
  }
  const cids = selectedCourses.map((c) => c.id)
  const qids = selectedQuizzes.map((q) => q.id)
  const [outline, questions, categories, summaries, settings, report, quizSummaries] =
    await Promise.all([
      cids.length
        ? client.rpc(courseDetail ? 'course_outlines' : 'course_overviews', { course_ids: cids })
        : none(),
      focusedQuiz
        ? client
            .from('quiz_questions')
            .select('*')
            .eq('quiz_id', focusedQuiz.id)
            .order('position')
            .limit(100)
        : Promise.resolve({ data: [], error: null }),
      coursePage || section === 'settings'
        ? client.from('categories').select('name').order('name')
        : none(),
      enrollmentRows.length
        ? client.rpc('enrollment_summaries', {
            enrollment_ids: clip(enrollmentRows).map((e) => e.id),
          })
        : none(),
      client.from('platform_settings').select('*').single(),
      dashboard
        ? client.rpc('workspace_summary')
        : Promise.resolve({ data: emptyState.summary, error: null }),
      qids.length ? client.rpc('quiz_summaries', { quiz_ids: qids }) : none(),
    ])
  if (
    outline.error ||
    questions.error ||
    categories.error ||
    summaries.error ||
    settings.error ||
    report.error ||
    quizSummaries.error
  )
    throw new Error('Unable to load course curriculum. Check the database migration.')
  const outlines =
    (outline.data as unknown as {
      id: string
      modules: Module[]
      enrolledCount: number
      tutorName: string
    }[]) || []
  state.courses = selectedCourses.map((c) => {
    const tutor = state.users.find((u) => u.id === c.tutor_id)
    const detail = outlines.find((o) => o.id === c.id)
    return {
      id: c.id,
      slug: c.slug,
      title: c.title,
      description: c.description,
      thumbnail: c.thumbnail,
      tutorId: c.tutor_id,
      tutorName: detail?.tutorName || tutor?.name || 'Instructor',
      tutorAvatar: tutor?.avatar || '',
      category: c.category,
      level: c.level,
      status: c.status,
      price: Number(c.price),
      duration: Number(c.duration),
      requireAssessment: c.require_assessment,
      completionRule: c.completion_rule,
      certificateMode: c.certificate_mode,
      enrolledCount: detail?.enrolledCount || 0,
      rating: 0,
      reviewCount: 0,
      tags: c.tags,
      modules: detail?.modules || [],
      createdAt: c.created_at,
      updatedAt: c.updated_at,
    } as Course
  })
  const questionRows = questions.data || []
  const quizCounts = (quizSummaries.data || []) as unknown as {
    attemptsUsed: number
    attemptLimit: number | null
    attemptsRemaining: number | null
    retryAvailableAt: string | null
    id: string
    questionCount: number
    hasAccess: boolean
    bestScore: number | null
    passed: boolean
    inProgress: boolean
  }[]
  state.quizzes = selectedQuizzes.map(
    (q) =>
      ({
        id: q.id,
        courseId: q.course_id || '',
        creatorId: q.creator_id,
        purpose: q.purpose,
        maxAttempts: q.max_attempts,
        retryDelayMinutes: q.retry_delay_minutes,
        feedbackPolicy: q.feedback_policy,
        attemptsUsed: quizCounts.find((s) => s.id === q.id)?.attemptsUsed || 0,
        attemptLimit: quizCounts.find((s) => s.id === q.id)?.attemptLimit ?? null,
        attemptsRemaining: quizCounts.find((s) => s.id === q.id)?.attemptsRemaining ?? null,
        retryAvailableAt: quizCounts.find((s) => s.id === q.id)?.retryAvailableAt ?? null,
        price: q.price,
        hasAccess: quizCounts.find((s) => s.id === q.id)?.hasAccess === true,
        certificateRule: q.certificate_rule,
        certificateMode: q.certificate_mode,
        title: q.title,
        thumbnail: q.thumbnail_path
          ? `${supabaseConfig().url.replace(/\/$/, '')}/storage/v1/object/public/${THUMBNAIL_BUCKET}/${q.thumbnail_path}`
          : '',
        status: q.status,
        version: q.version,
        passingScore: q.passing_score,
        timeLimit: q.time_limit,
        questionCount: quizCounts.find((s) => s.id === q.id)?.questionCount || 0,
        bestScore: quizCounts.find((s) => s.id === q.id)?.bestScore ?? null,
        passed: quizCounts.find((s) => s.id === q.id)?.passed || false,
        inProgress: quizCounts.find((s) => s.id === q.id)?.inProgress || false,
        questions: questionRows
          .filter((x) => x.quiz_id === q.id)
          .map((x) => ({
            id: x.id,
            text: x.text,
            options: x.options as unknown as QuizQuestion['options'],
            correctOptionId: '',
          })),
      }) as Quiz,
  )
  if (user.role !== 'learner' && qids.length) {
    const batches = Array.from({ length: Math.ceil(qids.length / 100) }, (_, i) =>
      qids.slice(i * 100, i * 100 + 100),
    )
    const [keyReply, ...infoReplies] = await Promise.all([
      focusedQuiz ? client.rpc('quiz_editor_keys_bulk', { quiz_ids: [focusedQuiz.id] }) : none(),
      ...batches.map((quiz_ids) => client.rpc('quiz_authoring_info', { quiz_ids })),
    ])
    if (keyReply.error) throw new Error(keyReply.error.message)
    const keys = (keyReply.data || []) as unknown as Pick<
      QuizQuestion,
      'id' | 'correctOptionId' | 'explanation'
    >[]
    const authoring: { id: string; editLocked: boolean }[] = []
    for (const info of infoReplies) {
      if (info.error) throw new Error(info.error.message)
      authoring.push(...(info.data as unknown as typeof authoring))
    }
    state.quizzes = state.quizzes.map((q) => ({
      ...q,
      editLocked: authoring.find((a) => a.id === q.id)?.editLocked || false,
      questions: q.questions.map((x) => ({ ...x, ...keys.find((k) => k.id === x.id) })),
    }))
  }
  state.certificates = clip(certificateRows).map((c) => ({
    id: c.id,
    learnerId: c.learner_id,
    courseId: c.course_id || '',
    quizId: c.quiz_id || undefined,
    courseTitle: c.course_title,
    learnerName: c.learner_name,
    issuedAt: c.issued_at,
    certificateUrl: `/certificates/${c.id}`,
  }))
  state.enrollments = clip(enrollmentRows).map((e) => {
    const summary = (
      (summaries.data as unknown as {
        id: string
        completedLessons: string[]
        totalLessons: number
        certificateIssued: boolean
        totalAssessments: number
        passedAssessments: number
        certificateEnabled: boolean
      }[]) || []
    ).find((x) => x.id === e.id)
    const done = summary?.completedLessons || []
    state.completedLessons[`${e.learner_id}:${e.course_id}`] = done
    return {
      id: e.id,
      learnerId: e.learner_id,
      courseId: e.course_id,
      enrolledAt: e.enrolled_at,
      lastAccessedAt: e.last_accessed_at,
      completedAt: e.completed_at || undefined,
      progress: summary?.totalLessons ? Math.round((100 * done.length) / summary.totalLessons) : 0,
      certificateIssued: summary?.certificateIssued || false,
      totalAssessments: summary?.totalAssessments || 0,
      passedAssessments: summary?.passedAssessments || 0,
      certificateEnabled: summary?.certificateEnabled ?? true,
    }
  })
  state.attempts = clip(attemptRows)
    .filter(
      (a): a is typeof a & { submitted_at: string; score: number; passed: boolean } =>
        !!a.submitted_at,
    )
    .map((a) => ({
      id: a.id,
      quizId: a.quiz_id,
      learnerId: a.learner_id,
      score: a.score,
      passed: a.passed,
      attemptedAt: a.submitted_at,
      timeTaken: Math.round((Date.parse(a.submitted_at) - Date.parse(a.started_at)) / 1000),
    }))
  state.notifications = clip(notificationRows).map((n) => ({
    href: n.href,
    id: n.id,
    userId: n.user_id,
    title: n.title,
    message: n.message,
    type: n.type as Notification['type'],
    isRead: n.is_read,
    createdAt: n.created_at,
  }))
  state.unreadNotifications = queries[9].count || 0
  if (focusedCourse && courseDetail && user.role === 'learner' && focus.endsWith('/learn')) {
    const lessonIds =
      state.courses
        .find((c) => c.id === focusedCourse.id)
        ?.modules.flatMap((m) => m.lessons.map((l) => l.id)) || []
    // Notes for a directly opened lesson must not depend on the general workspace page.
    for (let offset = 0; offset < lessonIds.length; offset += 100) {
      const { data, error } = await client
        .from('lesson_notes')
        .select('*')
        .eq('learner_id', user.id)
        .in('lesson_id', lessonIds.slice(offset, offset + 100))
      if (error) throw new Error(error.message)
      for (const note of data || [])
        state.notes[`${user.id}:${focusedCourse.id}:${note.lesson_id}`] = note.body
    }
  }
  state.preferences = {
    [user.id]: (profileRows.find((p) => p.id === user.id)?.preferences || {}) as Record<
      string,
      string | boolean
    >,
  }
  if (settings.data && user.role === 'admin')
    state.preferences[user.id] = {
      ...state.preferences[user.id],
      platformName: settings.data.platform_name,
      enrollmentOpen: settings.data.enrollment_open,
      certificateEnabled: settings.data.certificate_enabled,
    }
  state.categories = (categories.data || []).map((c) => c.name)
  state.summary = report.data as unknown as WorkspaceSummary
  state.platformName = settings.data?.platform_name || emptyState.platformName
  return { state, hasMore, page }
}
