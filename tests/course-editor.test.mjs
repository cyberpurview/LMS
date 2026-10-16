import { courseUrlExports } from './helpers/course-url.mjs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
const schema = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/commands.ts', import.meta.url), 'utf8')),
  { exports: schema, require },
)
const source = compile(
  await readFile(new URL('../src/components/features/courses.tsx', import.meta.url), 'utf8'),
)
const user = { id: randomUUID(), role: 'tutor', name: 'Tutor', avatar: '', isActive: true }
function editor({ existing, fail = false, workspace = {} } = {}) {
  const slots = []
  let index = 0
  const events = []
  const exports = {}
  const state = {
    courses: existing ? [existing] : [],
    users: [user],
    categories: ['Cybersecurity'],
    enrollments: [],
    quizzes: [],
    ...workspace,
  }
  const placeholders = new Proxy(
    {},
    { get: (_target, key) => (typeof key === 'string' ? key : undefined) },
  )
  vm.runInNewContext(source, {
    exports,
    Error,
    crypto: { randomUUID },
    require: (name) => {
      if (name === '@/lib/lms/course-url') return courseUrlExports
      if (name === 'react')
        return {
          ...require('react'),
          useEffect: () => {},
          useRef: (initial) => {
            const slot = index++
            if (!(slot in slots)) slots[slot] = { current: initial }
            return slots[slot]
          },
          useState: (initial) => {
            const slot = index++
            if (!(slot in slots)) slots[slot] = initial
            return [
              slots[slot],
              (value) => {
                slots[slot] = typeof value === 'function' ? value(slots[slot]) : value
              },
            ]
          },
        }
      if (name === 'next/navigation')
        return { useRouter: () => ({ push: (path) => events.push(['navigate', path]) }) }
      if (name === '@/lib/lms/commands') return schema
      if (name === '@/lib/utils') return { formatCurrency: (value) => `$${value.toFixed(2)}` }
      if (name === '@/lib/lms/store')
        return {
          useLms: () => ({
            state,
            user,
            notice: (message) => events.push(['notice', message]),
            mutate: async (command) => {
              events.push(['mutate', command])
              return true
            },
            execute: async (command) => {
              if (fail) throw new Error('Course changed in another session. Reload before saving.')
              assert.equal(schema.commandSchema.safeParse(command).success, true)
              events.push(['save', command])
              return { updatedAt: '2026-10-11T18:00:00.123456+00:00' }
            },
          }),
        }
      if (name.startsWith('@/') || name.startsWith('./')) return placeholders
      return require(name)
    },
  })
  function render() {
    index = 0
    return exports.CourseEditor({ role: 'tutor', id: existing?.id })
  }
  function nodes(node) {
    if (!node || typeof node !== 'object') return []
    if (Array.isArray(node)) return node.flatMap(nodes)
    return [node, ...nodes(node.props?.children)]
  }
  function find(predicate) {
    return nodes(render()).find(predicate)
  }
  function field(label, value) {
    const container = find((n) => n.props?.label === label)
    container.props.children.props.onChange({ target: { value } })
  }
  async function submit() {
    await find((n) => n.type === 'form').props.onSubmit({ preventDefault() {} })
  }
  return {
    state,
    field,
    find,
    all: () => nodes(render()),
    submit,
    events,
    preview: (lesson) =>
      nodes(exports.SavedLessonPreview({ lesson, editHref: '/tutor/courses/test/edit' })),
    detail: (role) => nodes(exports.CourseDetail({ role, id: existing.id })),
    player: () => {
      index = 0
      return nodes(exports.CoursePlayer({ id: existing.id }))
    },
  }
}

test('saved lesson preview displays text, video and explicit empty-content states', () => {
  const form = editor()
  const lesson = {
    id: randomUUID(),
    title: 'Security basics',
    type: 'video',
    duration: 10,
    content: 'Saved guide\nSecond paragraph',
    videoUrl: 'https://example.com/lesson.mp4',
  }
  const preview = form.preview(lesson)
  assert.ok(preview.some((n) => n.props?.content === lesson.content))
  assert.equal(preview.filter((n) => n.type === 'WorksheetEditor').length, 1)
  assert.ok(preview.some((n) => n.props?.children === 'Read-only preview'))
  assert.equal(preview.find((n) => n.type === 'video').props.src, lesson.videoUrl)
  assert.ok(preview.some((n) => n.props?.href === '/tutor/courses/test/edit'))
  const blank = form.preview({ ...lesson, content: '', videoUrl: '' })
  assert.ok(
    blank.some(
      (n) =>
        typeof n.props?.empty === 'string' &&
        n.props.empty.includes('No lesson text has been saved'),
    ),
  )
  assert.ok(blank.some((n) => n.props?.children === 'No video URL has been saved yet.'))
})

test('course option refreshes preserve typed fields and mark a removed category without replacing it', () => {
  const form = editor()
  form.field('Course title', 'Draft in progress')
  form.state.categories = ['Risk & Governance']
  assert.equal(
    form.find((n) => n.props?.label === 'Course title').props.children.props.value,
    'Draft in progress',
  )
  const category = form.find((n) => n.props?.label === 'Category').props.children
  assert.equal(category.props.value, 'Cybersecurity')
  assert.ok(
    category.props.children
      .flat()
      .some((n) => n?.type === 'option' && n.props.value === 'Cybersecurity' && n.props.disabled),
  )
})

test('course purchase controls distinguish free enrollment, unavailable checkout and existing access', async () => {
  const base = {
    id: randomUUID(),
    title: 'Course',
    tutorId: user.id,
    tutorName: 'Tutor',
    status: 'published',
    modules: [],
    price: 50,
    thumbnail: '',
  }
  const paid = editor({ existing: base })
  const paidButton = paid
    .detail('learner')
    .find((n) => n.type === 'button' && n.props.children === 'Payments coming soon')
  assert.equal(paidButton.props.disabled, true)
  assert.equal(paidButton.props.onClick, undefined)
  const free = editor({ existing: { ...base, price: 0 } })
  const enrollButton = free.detail('learner').find((n) => n.type === 'button' && n.props.onClick)
  await enrollButton.props.onClick()
  assert.equal(free.events.find((e) => e[0] === 'mutate')[1].type, 'enroll')
  const enrolled = editor({
    existing: base,
    workspace: { enrollments: [{ courseId: base.id, learnerId: user.id, progress: 0 }] },
  })
  assert.ok(
    enrolled.detail('learner').some((n) => n.props?.href === `/learner/courses/${base.id}/learn`),
  )
  assert.equal(
    enrolled.detail('learner').some((n) => n.props?.children === 'Payments coming soon'),
    false,
  )
})

test('course completion requirements persist from the actual editor', async () => {
  const form = editor()
  form.field('Course title', 'Lesson-only course')
  form
    .find((n) => n.type === 'select' && n.props.value === 'lessons_pass')
    .props.onChange({ target: { value: 'lessons' } })
  await form.submit()
  assert.equal(form.events.find((e) => e[0] === 'save')[1].course.requireAssessment, false)
  assert.equal(form.events.find((e) => e[0] === 'save')[1].course.completionRule, 'lessons')
})

test('learner course overview exposes every published assessment with authoritative progress', () => {
  const course = {
    id: randomUUID(),
    title: 'Flow',
    tutorId: user.id,
    tutorName: 'Tutor',
    description: 'Guide',
    status: 'published',
    price: 0,
    modules: [],
    requireAssessment: true,
  }
  const quizzes = [
    { id: randomUUID(), courseId: course.id, title: 'First', status: 'published', passed: true },
    { id: randomUUID(), courseId: course.id, title: 'Second', status: 'published', passed: false },
    { id: randomUUID(), courseId: course.id, title: 'Draft', status: 'draft' },
  ]
  const enrollment = {
    id: randomUUID(),
    courseId: course.id,
    learnerId: user.id,
    progress: 100,
    totalAssessments: 2,
    passedAssessments: 1,
    certificateIssued: false,
  }
  const form = editor({ existing: course, workspace: { quizzes, enrollments: [enrollment] } })
  const nodes = form.detail('learner')
  for (const quiz of quizzes.slice(0, 2))
    assert.ok(nodes.some((n) => n.props?.href === `/learner/quizzes/${quiz.id}`))
  assert.equal(
    nodes.some((n) => n.props?.href === `/learner/quizzes/${quizzes[2].id}`),
    false,
  )
  assert.ok(nodes.some((n) => n.props?.children === 'Lessons complete — one quiz remaining'))
  assert.ok(
    nodes.some((n) => n.props?.children === 'Pass the remaining quiz to finish this course.'),
  )
  assert.ok(nodes.some((n) => n.props?.href === '#course-assessments'))
})

test('learner completion copy prioritizes earned records and respects approval, optional lessons and submission rules', () => {
  const course = {
    id: randomUUID(),
    title: 'Course',
    tutorId: user.id,
    tutorName: user.name,
    status: 'published',
    modules: [],
    price: 0,
    completionRule: 'lessons_pass',
    requireAssessment: true,
  }
  const quiz = {
    id: randomUUID(),
    courseId: course.id,
    title: 'Final quiz',
    status: 'published',
    passed: false,
  }
  const base = {
    id: randomUUID(),
    courseId: course.id,
    learnerId: user.id,
    progress: 100,
    totalAssessments: 1,
    passedAssessments: 0,
    certificateIssued: false,
  }
  const scenarios = [
    { course, enrollment: { ...base, certificateIssued: true }, expected: 'Certificate earned' },
    {
      course: { ...course, certificateMode: 'approval' },
      enrollment: { ...base, completedAt: '2026-10-15T10:00:00Z' },
      expected: 'Course completed',
      message: 'Your certificate is awaiting approval.',
    },
    {
      course: { ...course, completionRule: 'quiz_pass' },
      enrollment: { ...base, progress: 0 },
      expected: 'one quiz remaining',
    },
    {
      course: { ...course, completionRule: 'lessons', requireAssessment: false },
      enrollment: { ...base, progress: 40 },
      expected: 'Continue learning',
    },
    {
      course: { ...course, completionRule: 'lessons_submit' },
      enrollment: base,
      expected: 'Lessons complete — finish the quizzes',
    },
  ]
  for (const scenario of scenarios) {
    const nodes = editor({
      existing: scenario.course,
      workspace: { enrollments: [scenario.enrollment], quizzes: [quiz] },
    }).detail('learner')
    assert.ok(nodes.some((n) => n.type === 'h3' && n.props.children === scenario.expected))
    if (scenario.message) assert.ok(nodes.some((n) => n.props?.children === scenario.message))
    assert.equal(
      nodes.some(
        (n) =>
          typeof n.props?.children === 'string' && n.props.children.includes('Issue automatically'),
      ),
      false,
    )
    if (scenario.enrollment.certificateIssued) {
      assert.ok(nodes.some((n) => n.props?.href === `/learner/certificates/course/${course.id}`))
      assert.equal(
        nodes.some(
          (n) =>
            typeof n.props?.children === 'string' && n.props.children.includes('quiz remaining'),
        ),
        false,
      )
      assert.ok(
        nodes.some(
          (n) =>
            n.type === 'details' &&
            !n.props.open &&
            n.props.children?.[0]?.props?.children === 'Course assessments',
        ),
      )
    }
  }
})

test('reviewing completed lessons moves forward without database writes and the final lesson has a next destination', async () => {
  const course = {
    id: randomUUID(),
    title: 'Flow',
    tutorId: user.id,
    modules: [
      {
        id: randomUUID(),
        title: 'Module',
        lessons: [
          { id: randomUUID(), title: 'First', duration: 1, type: 'reading' },
          { id: randomUUID(), title: 'Last', duration: 1, type: 'reading' },
        ],
      },
    ],
  }
  const enrollment = {
    courseId: course.id,
    learnerId: user.id,
    progress: 100,
    totalAssessments: 2,
    passedAssessments: 1,
    certificateIssued: false,
  }
  const form = editor({
    existing: course,
    workspace: {
      quizzes: [],
      enrollments: [enrollment],
      completedLessons: { [`${user.id}:${course.id}`]: course.modules[0].lessons.map((l) => l.id) },
    },
  })
  const button = form
    .player()
    .find((n) => n.type === 'button' && n.props.children?.[0] === 'Continue to next lesson')
  assert.ok(button)
  await button.props.onClick()
  assert.equal(form.events.filter((e) => e[0] === 'mutate').length, 0)
  assert.ok(
    form.player().some((n) => n.props?.href === `/learner/courses/${course.id}#course-assessments`),
  )
})

test('course overview offers previews only to staff and keeps learners on the outline', () => {
  const course = {
    id: randomUUID(),
    tutorId: user.id,
    tutorName: 'Tutor',
    title: 'Course',
    description: 'Overview',
    status: 'published',
    category: 'Cybersecurity',
    price: 0,
    modules: [
      {
        id: randomUUID(),
        title: 'Module',
        lessons: [
          {
            id: randomUUID(),
            title: 'Lesson',
            content: 'Private saved content',
            type: 'reading',
            duration: 10,
          },
        ],
      },
    ],
  }
  const form = editor({ existing: course })
  for (const role of ['tutor', 'admin']) {
    const preview = form.detail(role).find((n) => n.type?.name === 'SavedLessonPreview')
    assert.equal(preview.props.lesson.content, 'Private saved content')
    assert.match(preview.props.editHref, new RegExp(`^/${role}/courses/`))
  }
  assert.equal(
    form.detail('learner').some((n) => n.type?.name === 'SavedLessonPreview'),
    false,
  )
})
test('tutor saves a title-only draft and unfinished modules from the actual editor', async () => {
  const form = editor()
  form.field('Course title', 'Cybersecurity fundamentals')
  form.find((n) => n.type === 'button' && n.props.children?.[1] === 'Add module').props.onClick()
  await form.submit()
  const saved = form.events.find((e) => e[0] === 'save')[1].course
  assert.equal(saved.status, 'draft')
  assert.equal(saved.description, '')
  assert.equal(saved.modules.length, 1)
  assert.equal(saved.modules[0].title, '')
  assert.equal(saved.modules[0].lessons.length, 0)
  assert.equal(saved.tutorId, user.id)
  assert.equal(form.events.at(-1)[1], `/tutor/courses/${saved.id}`)
})
test('blank title and failed saves show inline errors and retain form contents', async () => {
  const blank = editor()
  await blank.submit()
  assert.ok(blank.find((n) => n.props?.role === 'alert'))
  assert.equal(blank.events.length, 0)
  const failed = editor({ fail: true })
  failed.field('Course title', 'Keep my draft')
  await failed.submit()
  assert.match(failed.find((n) => n.props?.role === 'alert').props.children, /another session/)
  assert.equal(
    failed.find((n) => n.props?.placeholder === 'e.g. Cybersecurity fundamentals').props.value,
    'Keep my draft',
  )
  assert.equal(failed.events.length, 0)
})
test('editing a saved draft sends its original concurrency timestamp', async () => {
  const existing = {
    id: randomUUID(),
    tutorId: user.id,
    title: 'Draft',
    description: '',
    category: 'Cybersecurity',
    level: 'Beginner',
    status: 'draft',
    price: 0,
    duration: 0,
    modules: [],
    updatedAt: '2026-10-10T10:00:00.123456+00:00',
  }
  const form = editor({ existing })
  form.field('Course title', 'Revised draft')
  await form.submit()
  const saved = form.events.find((e) => e[0] === 'save')[1].course
  assert.equal(saved.id, existing.id)
  assert.equal(saved.updatedAt, existing.updatedAt)
  assert.equal(saved.title, 'Revised draft')
})
test('publication validation accepts completed curricula and rejects incomplete drafts', () => {
  const course = {
    id: randomUUID(),
    tutorId: user.id,
    title: 'Course',
    description: '',
    category: 'Cybersecurity',
    level: 'Beginner',
    status: 'draft',
    price: 0,
    duration: 1,
    thumbnail: '',
    tags: [],
    updatedAt: new Date().toISOString(),
    modules: [],
  }
  assert.equal(schema.courseSchema.safeParse(course).success, true)
  assert.equal(schema.courseSchema.safeParse({ ...course, status: 'published' }).success, false)
  course.description = 'Learn security'
  course.modules = [
    {
      id: randomUUID(),
      title: 'Start',
      lessons: [
        {
          id: randomUUID(),
          title: 'Lesson',
          type: 'video',
          duration: 10,
          content: '',
          videoUrl: '',
        },
      ],
    },
  ]
  assert.equal(schema.courseSchema.safeParse({ ...course, status: 'published' }).success, false)
  course.modules[0].lessons[0].videoUrl = 'https://example.com/lesson.mp4'
  assert.equal(schema.courseSchema.safeParse({ ...course, status: 'published' }).success, true)
})

test('curriculum builder saves lesson content, video URL, durations and course settings', async () => {
  const form = editor()
  form.field('Course title', 'Cloud security')
  form.field('Description', 'Secure cloud workloads')
  form.field('Price (USD)', '29.50')
  form.field('Duration (hours)', '2.5')
  form.find((n) => n.type === 'button' && n.props.children?.[1] === 'Add module').props.onClick()
  form
    .find((n) => n.props?.['aria-label'] === 'Module 1 title')
    .props.onChange({ target: { value: 'Foundations' } })
  form.find((n) => n.type === 'button' && n.props.children === '+ Add lesson').props.onClick()
  const change = (label, value) =>
    form.find((n) => n.props?.['aria-label'] === label).props.onChange({ target: { value } })
  change('Lesson title', 'Secure deployment')
  change('Lesson type', 'video')
  change('Lesson duration in minutes', '25')
  form
    .find((n) => n.props?.label === 'Lesson guide for Secure deployment')
    .props.onChange('Follow these deployment steps.')
  change('Video URL', 'https://example.com/lesson.mp4')
  await form.submit()
  const saved = form.events.find((e) => e[0] === 'save')[1].course
  assert.equal(saved.price, 29.5)
  assert.equal(saved.duration, 2.5)
  assert.equal(saved.modules[0].title, 'Foundations')
  assert.equal(saved.modules[0].lessons[0].duration, 25)
  assert.equal(saved.modules[0].lessons[0].content, 'Follow these deployment steps.')
  assert.equal(saved.modules[0].lessons[0].videoUrl, 'https://example.com/lesson.mp4')
})

test('new lesson PDF upload saves a draft in place and subsequent saves use its exact revision', async () => {
  const form = editor()
  form.field('Course title', 'PDF course')
  form.find((n) => n.type === 'button' && n.props.children?.[1] === 'Add module').props.onClick()
  form
    .find((n) => n.props?.['aria-label'] === 'Module 1 title')
    .props.onChange({ target: { value: 'Foundations' } })
  form.find((n) => n.type === 'button' && n.props.children === '+ Add lesson').props.onClick()
  const resource = form.find((n) => n.props?.beforeUpload)
  assert.equal(resource.props.saved, false)
  await resource.props.beforeUpload()
  assert.equal(form.events.filter(([type]) => type === 'navigate').length, 0)
  assert.equal(form.events.find(([type]) => type === 'save')[1].course.status, 'draft')
  assert.equal(form.find((n) => n.props?.beforeUpload).props.saved, true)
  await form.submit()
  assert.equal(
    form.events.filter(([type]) => type === 'save')[1][1].course.updatedAt,
    '2026-10-11T18:00:00.123456+00:00',
  )
})
test('removing a lesson or module updates the draft without requiring replacement content', async () => {
  const form = editor()
  form.field('Course title', 'Draft')
  form.find((n) => n.type === 'button' && n.props.children?.[1] === 'Add module').props.onClick()
  form
    .find((n) => n.props?.['aria-label'] === 'Module 1 title')
    .props.onChange({ target: { value: 'Foundations' } })
  form.find((n) => n.type === 'button' && n.props.children === '+ Add lesson').props.onClick()
  form.find((n) => n.props?.['aria-label'] === 'Remove lesson').props.onClick()
  form.find((n) => n.props?.children === 'Confirm remove lesson').props.onClick()
  assert.equal(
    form.find((n) => n.props?.['aria-label'] === 'Lesson title'),
    undefined,
  )
  form.find((n) => n.props?.['aria-label'] === 'Remove module 1').props.onClick()
  form.find((n) => n.props?.children === 'Remove module').props.onClick()
  await form.submit()
  assert.equal(form.events.find((e) => e[0] === 'save')[1].course.modules.length, 0)
})

test('a reopened draft accepts its Postgres timestamp when adding a second lesson', async () => {
  const existing = {
    id: randomUUID(),
    tutorId: user.id,
    title: 'Draft course',
    description: '',
    category: 'Cybersecurity',
    level: 'Beginner',
    status: 'draft',
    price: 0,
    duration: 1,
    updatedAt: '2026-10-11T00:15:42.987654+00:00',
    modules: [
      {
        id: randomUUID(),
        title: 'Module',
        lessons: [
          {
            id: randomUUID(),
            title: 'First lesson',
            type: 'reading',
            duration: 10,
            content: 'First guide',
            videoUrl: '',
          },
        ],
      },
    ],
  }
  const form = editor({ existing })
  form.find((n) => n.type === 'button' && n.props.children === '+ Add lesson').props.onClick()
  await form.submit()
  const command = form.events.find((e) => e[0] === 'save')[1]
  assert.equal(command.course.modules[0].lessons.length, 2)
  assert.equal(command.course.modules[0].lessons[0].content, 'First guide')
  assert.equal(command.course.updatedAt, existing.updatedAt)
  assert.equal(schema.commandSchema.parse(command).course.updatedAt, existing.updatedAt)
  for (const timestamp of ['not-a-date', '2026-13-11T00:00:00+00:00', '2026-10-11T00:00:00']) {
    assert.equal(
      schema.commandSchema.safeParse({
        ...command,
        course: { ...command.course, updatedAt: timestamp },
      }).success,
      false,
    )
  }
})

test('course editor preserves thumbnail changes and waits for image uploads before saving', async () => {
  const form = editor()
  form.field('Course title', 'Thumbnail course')
  const thumbnail = () => form.find((n) => n.type === 'CourseThumbnail')
  const imageUrl =
    'https://example.supabase.co/storage/v1/object/public/course-thumbnails/image.webp'
  thumbnail().props.onBusy(true)
  await form.submit()
  assert.equal(form.events.length, 0)
  thumbnail().props.onChange(imageUrl)
  thumbnail().props.onBusy(false)
  await form.submit()
  assert.equal(form.events.find((e) => e[0] === 'save')[1].course.thumbnail, imageUrl)
  thumbnail().props.onChange('')
  await form.submit()
  assert.equal(form.events.filter((e) => e[0] === 'save').at(-1)[1].course.thumbnail, '')
})

function largeDraft(moduleCount = 25, lessonCount = 20) {
  return {
    id: randomUUID(),
    tutorId: user.id,
    title: 'Large course',
    description: 'Course description',
    category: 'Cybersecurity',
    level: 'Beginner',
    status: 'draft',
    price: 0,
    duration: 1,
    updatedAt: '2026-10-15T12:00:00.000Z',
    modules: Array.from({ length: moduleCount }, (_, mi) => ({
      id: randomUUID(),
      title: `Module ${mi + 1}`,
      lessons: Array.from({ length: lessonCount }, (_, li) => ({
        id: randomUUID(),
        title: `Lesson ${mi + 1}.${li + 1}`,
        type: 'reading',
        duration: 10,
        content: `Content ${mi + 1}.${li + 1}`,
      })),
    })),
  }
}
test('large curricula show module cards and mount only the selected lesson editor on demand', () => {
  const form = editor({ existing: largeDraft() })
  const lessonEditors = () =>
    form
      .all()
      .filter(
        (n) => typeof n.props?.label === 'string' && n.props.label.startsWith('Lesson guide for'),
      )
  const resources = () => form.all().filter((n) => n.type === 'LessonResources')
  assert.equal(lessonEditors().length, 0)
  assert.equal(resources().length, 0)
  assert.equal(
    form.all().filter((n) => n.props?.['aria-label']?.startsWith('Edit lesson ')).length,
    20,
  )
  form.find((n) => n.props?.children === 'Collapse all').props.onClick()
  assert.equal(
    form.all().filter((n) => n.props?.['aria-label']?.startsWith('Edit lesson ')).length,
    0,
  )
  form
    .find((n) => n.props?.['aria-label'] === 'Search curriculum')
    .props.onChange({ target: { value: 'Lesson 25.20' } })
  assert.equal(
    form.all().filter((n) => n.props?.['aria-label']?.startsWith('Edit lesson ')).length,
    1,
  )
  form.find((n) => n.props?.['aria-label'] === 'Edit lesson 25.20: Lesson 25.20').props.onClick()
  assert.equal(lessonEditors().length, 1)
  assert.equal(resources().length, 1)
  assert.equal(lessonEditors()[0].props.value, 'Content 25.20')
  assert.equal(resources()[0].props.lessonId, form.state.courses[0].modules[24].lessons[19].id)
  assert.equal(
    form.find((n) => n.props?.role === 'tabpanel' && n.props.id === 'course-panel-details').props
      .hidden,
    true,
  )
  assert.equal(
    form.find((n) => n.props?.role === 'tabpanel' && n.props.id === 'course-panel-curriculum').props
      .hidden,
    false,
  )
})
test('lesson switching retains edits, uploads block navigation, and saving includes the full curriculum', async () => {
  const course = largeDraft(2, 2),
    form = editor({ existing: course })
  form.find((n) => n.props?.['aria-label'] === 'Edit lesson 1.1: Lesson 1.1').props.onClick()
  form
    .find((n) => n.props?.label === 'Lesson guide for Lesson 1.1')
    .props.onChange('Edited first lesson')
  form.find((n) => n.props?.['aria-label'] === 'Expand module 2').props.onClick()
  form.find((n) => n.props?.['aria-label'] === 'Edit lesson 2.2: Lesson 2.2').props.onClick()
  form
    .find((n) => n.props?.label === 'Lesson guide for Lesson 2.2')
    .props.onChange('Edited final lesson')
  const resources = form.find((n) => n.type === 'LessonResources')
  resources.props.onUploadStateChange(true)
  assert.equal(
    form.find((n) => n.props?.['aria-label'] === 'Edit lesson 1.1: Lesson 1.1').props.disabled,
    true,
  )
  form.find((n) => n.props?.['aria-label'] === 'Edit lesson 1.1: Lesson 1.1').props.onClick()
  assert.ok(form.find((n) => n.props?.label === 'Lesson guide for Lesson 2.2'))
  resources.props.onUploadStateChange(false)
  form.find((n) => n.props?.['aria-label'] === 'Edit lesson 1.1: Lesson 1.1').props.onClick()
  assert.equal(
    form.find((n) => n.props?.label === 'Lesson guide for Lesson 1.1').props.value,
    'Edited first lesson',
  )
  assert.ok(form.find((n) => n.props?.role === 'status' && n.props.children === 'Unsaved changes'))
  await form.submit()
  const saved = form.events.find((e) => e[0] === 'save')[1].course
  assert.equal(saved.modules.length, 2)
  assert.equal(saved.modules[0].lessons[0].content, 'Edited first lesson')
  assert.equal(saved.modules[1].lessons[1].content, 'Edited final lesson')
  assert.equal(saved.modules[1].lessons[0].content, 'Content 2.1')
  assert.equal(form.events.filter((e) => e[0] === 'navigate').length, 0)
  assert.ok(
    form.find((n) => n.props?.role === 'status' && n.props.children === 'All changes saved'),
  )
})
test('enrolled courses keep a single editable resource panel while curriculum fields stay locked', () => {
  const form = editor({ existing: { ...largeDraft(2, 2), enrolledCount: 3 } })
  form.find((n) => n.props?.['aria-label'] === 'Edit lesson 1.1: Lesson 1.1').props.onClick()
  assert.equal(form.all().filter((n) => n.type === 'LessonResources').length, 1)
  assert.equal(form.find((n) => n.type === 'LessonResources').props.editable, true)
  assert.equal(
    form.find((n) => n.props?.label === 'Lesson guide for Lesson 1.1').props.disabled,
    true,
  )
  assert.equal(form.find((n) => n.props?.['aria-label'] === 'Remove lesson').props.disabled, true)
  form.find((n) => n.props?.['aria-label'] === 'Expand module 2').props.onClick()
  form.find((n) => n.props?.['aria-label'] === 'Edit lesson 2.1: Lesson 2.1').props.onClick()
  assert.ok(form.find((n) => n.props?.label === 'Lesson guide for Lesson 2.1'))
})
