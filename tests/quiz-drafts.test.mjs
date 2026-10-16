import { courseUrlExports } from './helpers/course-url.mjs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const compile = (s) =>
  ts.transpileModule(s, {
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
  await readFile(new URL('../src/components/features/quizzes.tsx', import.meta.url), 'utf8'),
)
const uid = randomUUID(),
  cid = randomUUID()
const blank = {
  id: randomUUID(),
  text: '',
  options: [
    { id: randomUUID(), text: '' },
    { id: randomUUID(), text: '' },
  ],
  correctOptionId: '',
}
function editor(existing, fail = false) {
  const slots = [],
    events = [],
    exports = {}
  let index = 0
  const placeholders = new Proxy({}, { get: (_t, key) => key })
  const workspace = { courses: [{ id: cid, tutorId: uid }], quizzes: existing ? [existing] : [] }
  vm.runInNewContext(source, {
    exports,
    crypto: { randomUUID },
    Error,
    require: (name) => {
      if (name === '@/lib/lms/course-url') return courseUrlExports
      if (name === 'react')
        return {
          ...require('react'),
          useState: (initial) => {
            const slot = index++
            if (!(slot in slots)) slots[slot] = initial
            return [
              slots[slot],
              (v) => (slots[slot] = typeof v === 'function' ? v(slots[slot]) : v),
            ]
          },
        }
      if (name === 'next/navigation')
        return { useRouter: () => ({ push: (url) => events.push(['navigate', url]) }) }
      if (name === '@/lib/lms/commands') return schema
      if (name === '@/lib/lms/store')
        return {
          useLms: () => ({
            state: workspace,
            user: { id: uid },
            notice: (m) => events.push(['notice', m]),
            execute: async (command) => {
              if (fail) throw new Error('Assessment changed in another session.')
              assert.ok(schema.commandSchema.safeParse(command).success)
              events.push(['save', command])
            },
          }),
        }
      if (name.startsWith('@/') || name.startsWith('./')) return placeholders
      return require(name)
    },
  })
  const nodes = (n) =>
    !n || typeof n !== 'object'
      ? []
      : Array.isArray(n)
        ? n.flatMap(nodes)
        : [n, ...nodes(n.props?.children)]
  const render = () => {
    index = 0
    return nodes(exports.QuizEditor({ role: 'tutor', id: existing?.id }))
  }
  return {
    state: workspace,
    render,
    events,
    button: (label) => render().find((n) => n.type === 'button' && n.props.children === label),
  }
}
test('practice drafts normalize unlimited attempts and disable certificates, while assessment settings persist', async () => {
  const form = editor()
  const field = (label) => form.render().find((n) => n.props?.label === label)?.props.children
  field('Assessment title').props.onChange({ target: { value: 'Practice draft' } })
  field('Course').props.onChange({ target: { value: '' } })
  field('Quiz purpose').props.onChange({ target: { value: 'practice' } })
  assert.equal(field('Maximum attempts'), undefined)
  await form.button('Save draft').props.onClick()
  const practice = form.events.find((e) => e[0] === 'save')[1].quiz
  assert.equal(practice.purpose, 'practice')
  assert.equal(practice.maxAttempts, null)
  assert.equal(practice.feedbackPolicy, 'immediate')
  assert.equal(practice.certificateRule, 'none')
  assert.equal(practice.certificateMode, 'none')
  assert.equal(schema.quizSchema.safeParse({ ...practice, maxAttempts: 1 }).success, false)
  assert.equal(schema.quizSchema.safeParse({ ...practice, certificateRule: 'pass' }).success, false)
  const graded = editor()
  const setting = (label) => graded.render().find((n) => n.props?.label === label).props.children
  setting('Assessment title').props.onChange({ target: { value: 'Assessment draft' } })
  assert.equal(setting('Maximum attempts').props.value, 3)
  assert.equal(setting('Reveal correct answers').props.value, 'after_pass_or_last')
  setting('Maximum attempts').props.onChange({ target: { value: '1' } })
  setting('Wait between attempts (minutes)').props.onChange({ target: { value: '15' } })
  await graded.button('Save draft').props.onClick()
  const saved = graded.events.find((e) => e[0] === 'save')[1].quiz
  assert.equal(saved.maxAttempts, 1)
  assert.equal(saved.retryDelayMinutes, 15)
  assert.equal(saved.feedbackPolicy, 'after_pass_or_last')
})

test('quiz option refresh preserves title and selected course without switching to standalone', () => {
  const form = editor()
  form
    .render()
    .find((n) => n.props?.label === 'Assessment title')
    .props.children.props.onChange({ target: { value: 'Draft in progress' } })
  form.state.courses = []
  assert.equal(
    form.render().find((n) => n.props?.label === 'Assessment title').props.children.props.value,
    'Draft in progress',
  )
  const course = form.render().find((n) => n.props?.label === 'Course').props.children
  assert.equal(course.props.value, cid)
  assert.ok(
    course.props.children
      .flat()
      .some((n) => n?.type === 'option' && n.props.value === cid && n.props.disabled),
  )
})

test('standalone pricing persists, requires a positive paid price and resets for course access', async () => {
  const form = editor()
  const field = (label) => form.render().find((n) => n.props?.label === label).props.children
  field('Assessment title').props.onChange({ target: { value: 'Paid quiz' } })
  field('Course').props.onChange({ target: { value: '' } })
  field('Quiz access').props.onChange({ target: { value: 'paid' } })
  await form.button('Save draft').props.onClick()
  assert.equal(
    form.events.some((e) => e[0] === 'save'),
    false,
  )
  assert.ok(
    form
      .render()
      .some((n) => n.props?.children === 'Enter a price greater than zero for a paid quiz.'),
  )
  field('Price (USD)').props.onChange({ target: { value: '19.99' } })
  await form.button('Save draft').props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(form.events.find((e) => e[0] === 'save')[1].quiz.price, 19.99)
  field('Course').props.onChange({ target: { value: cid } })
  assert.equal(
    form.render().some((n) => n.props?.label === 'Quiz access'),
    false,
  )
  await form.button('Save draft').props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(form.events.filter((e) => e[0] === 'save').at(-1)[1].quiz.price, 0)
  const reopened = editor({
    id: randomUUID(),
    creatorId: uid,
    courseId: '',
    title: 'Paid draft',
    price: 29.99,
    status: 'draft',
    questions: [],
  })
  assert.equal(
    reopened.render().find((n) => n.props?.label === 'Quiz access').props.children.props.value,
    'paid',
  )
  await reopened.button('Save draft').props.onClick()
  assert.equal(reopened.events.find((e) => e[0] === 'save')[1].quiz.price, 29.99)
})

test('title-only and incomplete quiz drafts save from the actual editor and preserve revision', async () => {
  const newDraft = editor()
  newDraft
    .render()
    .find((n) => n.type === 'input' && n.props.value === '')
    .props.onChange({ target: { value: 'Risk assessment draft' } })
  await newDraft.button('Save draft').props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const created = newDraft.events.find(([event]) => event === 'save')[1].quiz
  assert.equal(created.status, 'draft')
  assert.equal(created.questions.length, 0)
  const resumed = editor({
    id: randomUUID(),
    courseId: cid,
    title: 'Incomplete draft',
    status: 'draft',
    version: 3,
    questions: [blank],
  })
  await resumed.button('Save draft').props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(resumed.events.find(([event]) => event === 'save')[1].quiz.version, 3)
  assert.equal(resumed.events.find(([event]) => event === 'save')[1].quiz.questions[0].text, '')
})

test('quiz creator can save a standalone draft with certificate qualification and approval settings', async () => {
  const form = editor()
  form
    .render()
    .find((n) => n.type === 'input' && n.props.value === '')
    .props.onChange({ target: { value: 'Standalone certification' } })
  form
    .render()
    .find((n) => n.type === 'select' && n.props.value === cid)
    .props.onChange({ target: { value: '' } })
  form
    .render()
    .find((n) => n.type === 'select' && n.props.value === 'none')
    .props.onChange({ target: { value: 'pass' } })
  form
    .render()
    .find((n) => n.type === 'select' && n.props.value === 'automatic')
    .props.onChange({ target: { value: 'approval' } })
  await form.button('Save draft').props.onClick()
  const saved = form.events.find((e) => e[0] === 'save')[1].quiz
  assert.equal(saved.courseId, '')
  assert.equal(saved.certificateRule, 'pass')
  assert.equal(saved.certificateMode, 'approval')
})

test('reopening a standalone draft preserves its lack of course and certificate settings', async () => {
  const form = editor({
    id: randomUUID(),
    creatorId: uid,
    courseId: '',
    title: 'Standalone draft',
    status: 'draft',
    version: 1,
    questions: [],
    passingScore: 70,
    timeLimit: 20,
    certificateRule: 'submit',
    certificateMode: 'approval',
  })
  await form.button('Save draft').props.onClick()
  const saved = form.events.find((e) => e[0] === 'save')[1].quiz
  assert.equal(saved.courseId, '')
  assert.equal(saved.certificateRule, 'submit')
  assert.equal(saved.certificateMode, 'approval')
})
test('quiz creators can upload a custom thumbnail, wait for uploads and restore course inheritance', async () => {
  const draft = {
    id: randomUUID(),
    courseId: cid,
    title: 'Draft',
    status: 'draft',
    version: 1,
    questions: [],
  }
  const h = editor(draft)
  const choice = () =>
    h.render().find((n) => n.type === 'select' && ['course', 'custom'].includes(n.props.value))
  assert.equal(choice().props.value, 'course')
  choice().props.onChange({ target: { value: 'custom' } })
  const upload = h.render().find((n) => n.type === 'CourseThumbnail')
  assert.equal(upload.props.courseId, cid)
  upload.props.onBusy(true)
  assert.equal(h.button('Save draft').props.disabled, true)
  await h.button('Save draft').props.onClick()
  assert.equal(h.events.length, 0)
  upload.props.onChange('https://test.supabase.co/custom.webp')
  upload.props.onBusy(false)
  await h.button('Save draft').props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(
    h.events.find(([event]) => event === 'save')[1].quiz.thumbnail,
    'https://test.supabase.co/custom.webp',
  )
  choice().props.onChange({ target: { value: 'course' } })
  await h.button('Save draft').props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.equal(h.events.filter(([event]) => event === 'save').at(-1)[1].quiz.thumbnail, '')
})

test('publish rejects unfinished drafts and save failures retain the form with an inline error', async () => {
  const draft = {
    id: randomUUID(),
    courseId: cid,
    title: 'Draft',
    status: 'draft',
    version: 1,
    questions: [blank],
  }
  const incomplete = editor(draft)
  incomplete
    .render()
    .find((n) => n.type === 'form')
    .props.onSubmit({ preventDefault() {} })
  assert.ok(incomplete.render().some((n) => n.props?.role === 'alert'))
  assert.equal(incomplete.events.length, 0)
  const failed = editor(draft, true)
  await failed.button('Save draft').props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.ok(
    failed
      .render()
      .some((n) => n.props?.role === 'alert' && n.props.children.includes('another session')),
  )
  assert.equal(failed.render().find((n) => n.type === 'textarea')?.props.value, '')
  assert.equal(failed.render().find((n) => n.type === 'input').props.value, 'Draft')
  assert.equal(failed.button('Save draft').props.disabled, false)
})
test('attempted quizzes are read-only and draft copies generate new IDs without altering original results', async () => {
  const original = {
    id: randomUUID(),
    courseId: cid,
    title: 'Published quiz',
    passingScore: 70,
    timeLimit: 20,
    status: 'published',
    version: 2,
    editLocked: true,
    questions: [
      {
        ...blank,
        text: 'What is the risk?',
        options: blank.options.map((o, i) => ({ ...o, text: i ? 'High' : 'Low' })),
        correctOptionId: blank.options[0].id,
      },
    ],
  }
  const h = editor(original)
  assert.equal(h.render().find((n) => n.type === 'fieldset').props.disabled, true)
  h.render()
    .find((n) => n.type === 'form')
    .props.onSubmit({ preventDefault() {} })
  assert.equal(h.events.length, 0)
  await h.button('Create draft copy').props.onClick()
  const copy = h.events.find(([event]) => event === 'save')[1].quiz
  assert.equal(copy.status, 'draft')
  assert.notEqual(copy.id, original.id)
  assert.notEqual(copy.questions[0].id, original.questions[0].id)
  assert.equal(copy.questions[0].correctOptionId, copy.questions[0].options[0].id)
  assert.notEqual(copy.questions[0].correctOptionId, original.questions[0].correctOptionId)
  assert.equal(original.status, 'published')
  assert.equal(original.version, 2)
})
