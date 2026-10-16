import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const compile = (s, fileName = 'component.tsx') =>
  ts.transpileModule(s, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
const schemas = {}
vm.runInNewContext(
  compile(
    await readFile(new URL('../src/lib/lms/ai-course.ts', import.meta.url), 'utf8'),
    'schema.ts',
  ),
  { exports: schemas, require },
)
test('AI builder creates once, ignores stale status, approves edited outlines and opens a completed draft', async () => {
  const { JSDOM } = require('jsdom'),
    dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'),
    { createRoot } = require('react-dom/client'),
    exports = {},
    requests = [],
    fields = new Map(),
    timers = new Map(),
    invalidations = [],
    notices = []
  const uid = randomUUID()
  let timer = 0
  const plain = ({ children }) => React.createElement('div', null, children)
  vm.runInNewContext(
    compile(
      await readFile(
        new URL('../src/components/features/ai-course-builder.tsx', import.meta.url),
        'utf8',
      ),
    ),
    {
      exports,
      document,
      window: dom.window,
      URLSearchParams,
      AbortController,
      crypto: { randomUUID },
      setInterval: (fn) => {
        timers.set(++timer, fn)
        return timer
      },
      clearInterval: (id) => timers.delete(id),
      fetch: (url, options = {}) =>
        new Promise((resolve) => requests.push({ url, options, resolve })),
      require: (name) => {
        if (name === '@/lib/lms/ai-course') return schemas
        if (name === '@/lib/lms/store')
          return {
            useLms: () => ({
              state: {
                categories: ['Cybersecurity'],
                users: [{ id: uid, role: 'tutor', isActive: true }],
              },
              user: { id: uid },
              invalidateCaches: () => invalidations.push(true),
              notice: (message) => notices.push(message),
            }),
          }
        if (name === 'next/link')
          return { default: ({ children, ...props }) => React.createElement('a', props, children) }
        if (name === 'lucide-react')
          return {
            Sparkles: () => null,
            CheckCircle2: () => null,
            AlertCircle: () => null,
            Loader2: () => null,
            ChevronDown: () => null,
          }
        if (name === './common')
          return {
            FeatureShell: plain,
            Heading: plain,
            Panel: plain,
            Back: () => null,
            Field: ({ label, children }) => {
              fields.set(label, children)
              return React.createElement('label', null, label, children)
            },
            inputClass: '',
            primaryClass: '',
            secondaryClass: '',
          }
        return require(name)
      },
    },
  )
  const root = createRoot(document.getElementById('root'))
  const reply = async (index, data) =>
    React.act(async () => requests[index].resolve({ ok: true, json: async () => data }))
  const submit = async () =>
    React.act(async () =>
      document
        .querySelector('form')
        .dispatchEvent(new dom.window.Event('submit', { bubbles: true, cancelable: true })),
    )
  try {
    await React.act(async () =>
      root.render(React.createElement(exports.AiCourseBuilder, { role: 'tutor' })),
    )
    await reply(0, { jobs: [], available: true })
    await React.act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    await React.act(async () =>
      requests[1].resolve({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Your session has expired. Please sign in again.' }),
      }),
    )
    assert.ok(document.body.textContent.includes('Your session has expired'))
    assert.ok(document.querySelector('a[href="/login?next=%2Ftutor%2Fcourses%2Fai"]'))
    assert.equal(document.body.textContent.includes('AI generation is not configured yet.'), false)
    await React.act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    await reply(2, { jobs: [], available: true })
    assert.equal(document.body.textContent.includes('Your session has expired'), false)
    // Continue the existing workflow with only its own requests in the fixture.
    requests.splice(1, 2)
    await React.act(async () => {
      fields.get('Course title').props.onChange({ target: { value: 'Security fundamentals' } })
      fields.get('Modules').props.onChange({ target: { value: '1' } })
      fields.get('Lessons per module').props.onChange({ target: { value: '1' } })
    })
    await submit()
    await submit()
    assert.equal(requests.length, 2)
    const created = JSON.parse(requests[1].options.body)
    assert.equal(created.action, 'create')
    assert.equal(created.spec.title, 'Security fundamentals')
    const job = {
      id: created.id,
      spec: created.spec,
      status: 'outline_queued',
      outline: null,
      courseId: null,
      completed: 0,
      total: 0,
      error: null,
      model: null,
    }
    await React.act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    await reply(1, { job })
    await reply(2, { jobs: [], available: true })
    assert.ok(document.body.textContent.includes('Preparing your course outline'))
    await React.act(async () => [...timers.values()][0]())
    const outline = {
      description: 'Practical training',
      objectives: ['Recognize risks'],
      modules: [{ title: 'Fundamentals', lessons: ['Introduction'] }],
    }
    await reply(3, { jobs: [{ ...job, status: 'review', outline }], available: true })
    await React.act(async () =>
      fields.get('Module 1').props.onChange({ target: { value: 'Reviewed fundamentals' } }),
    )
    await submit()
    const approval = JSON.parse(requests[4].options.body)
    assert.equal(approval.outline.modules[0].title, 'Reviewed fundamentals')
    const courseId = randomUUID(),
      generating = { ...job, status: 'generating', outline: approval.outline, courseId, total: 1 }
    await reply(4, { job: generating })
    assert.equal(invalidations.length, 1)
    assert.ok(document.body.textContent.includes('0 of 1 lessons prepared'))
    await React.act(async () => [...timers.values()][0]())
    await reply(5, {
      jobs: [{ ...generating, status: 'complete', completed: 1, ready: 1 }],
      available: true,
    })
    const link = [...document.querySelectorAll('a')].find(
      (a) => a.textContent === 'Review course draft',
    )
    assert.equal(link.getAttribute('href'), `/tutor/courses/${courseId}/edit`)
    assert.equal(invalidations.length, 2)
    assert.ok(document.body.textContent.includes('Your course draft is ready'))
    assert.ok(document.body.textContent.includes('All 1 lessons ready for review'))
    assert.equal(notices.length, 1)
    const click = async (text) =>
      React.act(async () =>
        [...document.querySelectorAll('button')].find((b) => b.textContent.includes(text)).click(),
      )
    await click('Create another course')
    assert.ok(document.querySelector('form'))
    assert.equal(document.querySelector('#generation-history'), null)
    assert.equal(document.body.textContent.includes('Review course draft'), false)
    await click('Recent generations')
    assert.ok(document.querySelector('#generation-history'))
    await click('Security fundamentals')
    assert.ok(document.body.textContent.includes('Your course draft is ready'))
    assert.equal(document.querySelector('form'), null)
    // A completed processing loop is not falsely advertised as fully generated
    // when curriculum edits left a planned lesson empty or removed.
    await React.act(async () => document.dispatchEvent(new dom.window.Event('visibilitychange')))
    await reply(6, {
      jobs: [{ ...generating, status: 'complete', completed: 1, ready: 0 }],
      available: true,
    })
    assert.ok(document.body.textContent.includes('Generation finished — review needed'))
    assert.equal(document.body.textContent.includes('All 1 lessons ready for review'), false)
    assert.equal(notices.length, 1)
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
