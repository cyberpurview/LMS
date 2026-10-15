import { z } from 'zod'

const id = z.string().uuid()
const text = z.string().trim().min(1)
const lesson = z.object({
  id,
  title: z.string().trim().max(200),
  duration: z.number().int().min(0).max(1440),
  type: z.enum(['reading', 'video', 'quiz']),
  content: z.string().max(100000).default(''),
  videoUrl: z
    .union([
      z.literal(''),
      z
        .string()
        .url()
        .max(2048)
        .refine((url) => /^https?:\/\//i.test(url), 'Use an HTTP or HTTPS video URL.'),
    ])
    .default(''),
})
export const quizQuestionSchema = z
  .object({
    id,
    text: text.max(2000),
    options: z
      .array(z.object({ id, text: text.max(1000) }))
      .min(2)
      .max(10),
    correctOptionId: id,
    explanation: z.string().max(5000).optional(),
  })
  .refine(
    (q) => q.options.some((o) => o.id === q.correctOptionId),
    'Correct answer must be an option',
  )

export const quizSchema = z
  .object({
    price: z.number().min(0).max(10000000).multipleOf(0.01).default(0),
    id,
    courseId: z.union([id, z.literal('')]),
    purpose: z.enum(['practice', 'assessment']).default('assessment'),
    maxAttempts: z.number().int().min(1).max(1000).nullable().default(null),
    retryDelayMinutes: z.number().int().min(0).max(10080).default(0),
    feedbackPolicy: z.enum(['immediate', 'after_pass_or_last']).default('immediate'),
    certificateRule: z.enum(['none', 'submit', 'pass']).default('none'),
    certificateMode: z.enum(['automatic', 'approval', 'none']).default('automatic'),
    title: text.max(200),
    thumbnail: z.string().max(2048).default(''),
    status: z.enum(['draft', 'published']).default('published'),
    version: z.number().int().min(1).optional(),
    passingScore: z.number().int().min(1).max(100),
    timeLimit: z.number().int().min(1).max(180),
    questions: z
      .array(
        z.object({
          id,
          text: z.string().max(2000),
          options: z
            .array(z.object({ id, text: z.string().max(1000) }))
            .min(2)
            .max(10),
          correctOptionId: z.union([z.literal(''), id]),
          explanation: z.string().max(5000).optional(),
        }),
      )
      .max(100),
  })
  .superRefine((quiz, ctx) => {
    if (
      quiz.purpose === 'practice' &&
      (quiz.maxAttempts !== null ||
        quiz.retryDelayMinutes !== 0 ||
        quiz.feedbackPolicy !== 'immediate' ||
        quiz.certificateRule !== 'none' ||
        quiz.certificateMode !== 'none')
    )
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['purpose'],
        message:
          'Practice quizzes have unlimited attempts, immediate feedback and no certificates.',
      })
    if (quiz.courseId && quiz.certificateRule !== 'none')
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['certificateRule'],
        message: 'Course-linked quizzes use the course certificate.',
      })
    if (quiz.courseId && quiz.price > 0)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['price'],
        message: 'Course-linked quizzes use course access.',
      })
    if (new Set(quiz.questions.map((q) => q.id.toLowerCase())).size !== quiz.questions.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questions'],
        message: 'Questions must have unique IDs.',
      })
    quiz.questions.forEach((q, index) => {
      if (new Set(q.options.map((o) => o.id.toLowerCase())).size !== q.options.length)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['questions', index, 'options'],
          message: 'Answer options must have unique IDs.',
        })
    })
    if (quiz.status === 'draft') return
    if (!quiz.questions.length)
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['questions'],
        message: 'Add at least one question before publishing.',
      })
    quiz.questions.forEach((q, index) => {
      const result = quizQuestionSchema.safeParse(q)
      if (!result.success)
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['questions', index],
          message: `Question ${index + 1}: complete the question, answer options and correct answer before publishing.`,
        })
    })
  })

export const courseSchema = z
  .object({
    id,
    title: text.max(200),
    description: z.string().trim().max(20000),
    tutorId: id,
    category: text.max(80),
    level: z.enum(['Beginner', 'Intermediate', 'Advanced']),
    status: z.enum(['published', 'draft', 'archived']),
    price: z.number().min(0).max(10000000),
    duration: z.number().min(0).max(10000),
    requireAssessment: z.boolean().default(true),
    completionRule: z
      .enum(['lessons', 'lessons_pass', 'lessons_submit', 'quiz_pass', 'quiz_submit'])
      .optional(),
    certificateMode: z.enum(['automatic', 'approval', 'none']).default('automatic'),
    thumbnail: z.string().max(2048),
    tags: z.array(text.max(80)).max(20),
    // Postgres returns explicit UTC offsets and microseconds. Preserve the exact
    // value so the database can compare it without losing timestamp precision.
    updatedAt: z.string().datetime({ offset: true }),
    modules: z
      .array(z.object({ id, title: z.string().trim().max(200), lessons: z.array(lesson).max(100) }))
      .max(100),
  })
  .superRefine((course, ctx) => {
    const issue = (message: string, path: (string | number)[]) =>
      ctx.addIssue({ code: z.ZodIssueCode.custom, message, path })
    const lessonIds = course.modules.flatMap((m) => m.lessons.map((l) => l.id))
    if (lessonIds.length > 500) issue('A course can have up to 500 lessons.', ['modules'])
    if (
      new Set(course.modules.map((m) => m.id)).size !== course.modules.length ||
      new Set(lessonIds).size !== lessonIds.length
    )
      issue('Modules and lessons must have unique IDs.', ['modules'])
    if (course.status !== 'published') return
    if (!course.description.trim()) issue('Add a description before publishing.', ['description'])
    if (!course.modules.length) issue('Add at least one module before publishing.', ['modules'])
    course.modules.forEach((module, mi) => {
      if (!module.title.trim())
        issue('Give every module a title before publishing.', ['modules', mi, 'title'])
      if (!module.lessons.length)
        issue('Add a lesson to every module before publishing.', ['modules', mi, 'lessons'])
      module.lessons.forEach((lesson, li) => {
        if (!lesson.title.trim())
          issue('Give every lesson a title before publishing.', [
            'modules',
            mi,
            'lessons',
            li,
            'title',
          ])
        if (lesson.type === 'video' && !lesson.videoUrl)
          issue('Add a video URL before publishing.', ['modules', mi, 'lessons', li, 'videoUrl'])
      })
    })
  })

export const commandSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('award'),
    action: z.enum(['candidates', 'approve', 'claim']),
    kind: z.enum(['course', 'quiz']),
    subjectId: id,
    learnerId: id.optional(),
  }),
  z.object({
    type: z.literal('worksheet'),
    lessonId: id,
    body: z.string().trim().max(100000),
    previous: z.string().max(100000),
  }),
  z.object({ type: z.literal('category'), name: text.max(80) }),
  z.object({ type: z.literal('supportStatus'), id, status: z.enum(['open', 'closed']) }),
  z.object({ type: z.literal('enroll'), courseId: id }),
  z.object({ type: z.literal('claimCertificate'), courseId: id }),
  z.object({ type: z.literal('complete'), lessonId: id }),
  z.object({ type: z.literal('startQuiz'), quizId: id }),
  z.object({ type: z.literal('quizResult'), quizId: id }),
  z
    .object({
      type: z.literal('quizAttempts'),
      requestId: id.optional(),
      afterId: id.optional(),
      action: z.enum(['list', 'grant']),
      quizId: id,
      learnerId: id.optional(),
      extra: z.number().int().min(1).max(10).default(1),
      reason: z.string().trim().max(500).default(''),
    })
    .superRefine((value, ctx) => {
      if (
        value.action === 'grant' &&
        (!value.learnerId || !value.requestId || value.reason.length < 5)
      )
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'Choose a learner and provide a reason of at least 5 characters.',
        })
    }),
  z.object({
    type: z.literal('submitQuiz'),
    attemptId: id,
    answers: z
      .record(id, id)
      .refine((answers) => Object.keys(answers).length <= 100, 'Submit at most 100 answers.'),
  }),
  z.object({
    type: z.literal('saveCourse'),
    course: courseSchema,
  }),
  z.object({
    type: z.literal('saveQuiz'),
    quiz: quizSchema,
  }),
  z.object({
    type: z.literal('profile'),
    user: z.object({
      id,
      name: text.max(100),
      email: z.string().email(),
      role: z.enum(['admin', 'tutor', 'learner']),
      isActive: z.boolean(),
    }),
  }),
  z.object({
    type: z.literal('invite'),
    name: text.max(100),
    email: z.string().email(),
    role: z.enum(['tutor', 'learner']),
  }),
  z.object({
    type: z.literal('preferences'),
    preferences: z.record(z.string().max(80), z.union([z.string().max(200), z.boolean()])),
  }),
  z.object({ type: z.literal('readNotification'), id: id.nullable() }),
  z.object({ type: z.literal('note'), lessonId: id, body: z.string().max(20000) }),
  z.object({ type: z.literal('support'), subject: text.max(200), message: text.max(20000) }),
])
export type LmsCommand = z.input<typeof commandSchema>
