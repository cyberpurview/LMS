import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const compile = (s, fileName = 'module.tsx') =>
  ts.transpileModule(s, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
const stateExports = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/state.ts', import.meta.url), 'utf8')),
  { exports: stateExports, require: () => ({ BRAND_NAME: 'CyberPurview' }) },
)
const { emptyState } = stateExports
const workspaceSource = compile(
  await readFile(new URL('../src/lib/server/workspace.ts', import.meta.url), 'utf8'),
  'workspace.ts',
)
test('quiz and settings routes skip unrelated tables and reports while focused quizzes retain access checks', async () => {
  const exports = {},
    calls = []
  const qid = '11111111-1111-4111-8111-111111111111'
  const quiz = {
    id: qid,
    course_id: null,
    creator_id: 'tutor',
    title: 'Paid',
    price: 25,
    status: 'published',
    time_limit: 10,
    passing_score: 70,
  }
  const client = {
    from(table) {
      const call = { name: table, filters: [] }
      calls.push(call)
      let single = false
      const query = {
        select() {
          return this
        },
        order() {
          return this
        },
        range() {
          return this
        },
        limit() {
          return this
        },
        eq(k, v) {
          call.filters.push([k, v])
          return this
        },
        in() {
          return this
        },
        single() {
          single = true
          return this
        },
        maybeSingle() {
          single = true
          return this
        },
        then(resolve) {
          return Promise.resolve({
            data: table === 'quizzes' ? [quiz] : single ? { platform_name: 'CyberPurview' } : [],
            error: null,
            count: 0,
          }).then(resolve)
        },
      }
      return query
    },
    async rpc(name, args) {
      calls.push({ name, args })
      return {
        data: name === 'quiz_summaries' ? [{ id: qid, hasAccess: false, questionCount: 1 }] : [],
        error: null,
      }
    },
  }
  vm.runInNewContext(workspaceSource, {
    exports,
    structuredClone,
    require: (name) =>
      name === 'server-only'
        ? {}
        : name === '@/lib/lms/state'
          ? { emptyState }
          : name === '@/lib/supabase/config'
            ? { supabaseConfig: () => ({ url: 'https://example.test' }) }
            : name === '@/lib/lms/thumbnail'
              ? { THUMBNAIL_BUCKET: 'course-thumbnails' }
              : require(name),
  })
  const user = { id: 'learner', role: 'learner', name: 'Learner' }
  await exports.loadWorkspace(client, user, 0, '/learner/quizzes')
  for (const unnecessary of [
    'profiles',
    'courses',
    'certificates',
    'lesson_notes',
    'lesson_progress',
    'workspace_summary',
    'quiz_attempts',
    'course_overviews',
  ])
    assert.equal(
      calls.some((c) => c.name === unnecessary),
      false,
      unnecessary,
    )
  assert.ok(calls.some((c) => c.name === 'quiz_summaries'))
  calls.length = 0
  const focused = await exports.loadWorkspace(client, user, 0, `/learner/quizzes/${qid}`)
  assert.equal(focused.state.quizzes[0].hasAccess, false)
  assert.equal(focused.state.quizzes[0].questions.length, 0)
  assert.deepEqual(calls.find((c) => c.name === 'quizzes').filters, [['id', qid]])
  assert.deepEqual(calls.find((c) => c.name === 'quiz_questions').filters, [['quiz_id', qid]])
  assert.equal(
    calls.some((c) => c.name === 'workspace_summary'),
    false,
  )
  calls.length = 0
  await exports.loadWorkspace(client, user, 0, '/learner/settings')
  for (const unnecessary of [
    'courses',
    'enrollments',
    'quizzes',
    'certificates',
    'quiz_attempts',
    'lesson_notes',
    'lesson_progress',
    'workspace_summary',
  ])
    assert.equal(
      calls.some((c) => c.name === unnecessary),
      false,
      unnecessary,
    )
  assert.deepEqual(calls.find((c) => c.name === 'profiles').filters, [['id', 'learner']])
})

test('navigation reuses recent lists, expires them, invalidates writes and isolates account caches', async () => {
  const { JSDOM } = require('jsdom'),
    React = require('react'),
    { createRoot } = require('react-dom/client')
  const dom = new JSDOM('<div id="root"></div>', { pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const exports = {},
    calls = []
  let path = '/learner/quizzes',
    clock = 0,
    api,
    account = 'one'
  let role = 'learner',
    hold = false
  const deferred = []
  const connection = { saveData: false, effectiveType: '4g' }
  const channel = {
    on() {
      return this
    },
    subscribe() {
      return this
    },
  }
  class Clock extends Date {
    static now() {
      return clock
    }
  }
  const providerSource = compile(
    await readFile(new URL('../src/lib/lms/store.tsx', import.meta.url), 'utf8'),
  )
  vm.runInNewContext(providerSource, {
    exports,
    window,
    document,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    AbortController,
    Date: Clock,
    URLSearchParams,
    navigator: { connection },
    fetch: async (url, options) => {
      if (url === '/api/commands') return { ok: true, json: async () => ({ data: true }) }
      calls.push(url)
      if (hold)
        return new Promise((resolve) => {
          resolve.signal = options?.signal
          deferred.push(resolve)
        })
      return {
        ok: true,
        json: async () => ({
          state: {
            ...structuredClone(emptyState),
            platformName: `Snapshot ${calls.length}`,
            users: [{ id: account, name: account }],
          },
          hasMore: false,
        }),
      }
    },
    require: (name) =>
      name === './completion-sound'
        ? {
            createCompletionSoundFeed: () => () => {},
            prepareCompletionSound: () => {},
            closeCompletionSound: () => {},
          }
        : name === 'next/navigation'
          ? { usePathname: () => path }
          : name === 'next/link'
            ? { default: () => null }
            : name === './state'
              ? { emptyState }
              : name === '@/components/shared/DashboardLayout'
                ? { DashboardLayout: ({ children }) => React.createElement('div', null, children) }
                : name === '@/components/shared/DashboardContentSkeleton'
                  ? { DashboardContentSkeleton: () => null }
                  : name === '@/lib/supabase/client'
                    ? {
                        createClient: () => ({
                          channel: () => channel,
                          removeChannel: async () => {},
                        }),
                      }
                    : require(name),
  })
  function Probe() {
    api = exports.useLms()
    const [title, setTitle] = React.useState('')
    return React.createElement(
      'div',
      null,
      React.createElement('p', null, `Ready ${api.state.platformName}`),
      React.createElement('input', { 'aria-label': 'Draft title', value: title, readOnly: true }),
      React.createElement('button', { onClick: () => setTitle('Draft in progress') }, 'Type draft'),
    )
  }
  const root = createRoot(document.getElementById('root'))
  const render = () =>
    root.render(
      React.createElement(
        exports.LmsProvider,
        { key: account, user: { id: account, name: account, role } },
        React.createElement(Probe),
      ),
    )
  try {
    await React.act(async () => render())
    assert.equal(calls.length, 1)
    path = '/learner/certificates'
    await React.act(async () => render())
    assert.equal(calls.length, 2)
    path = '/learner/quizzes'
    await React.act(async () => render())
    assert.equal(calls.length, 2)
    clock = 30001
    path = '/learner/certificates'
    await React.act(async () => render())
    assert.equal(calls.length, 3)
    await React.act(async () => api.execute({ type: 'note', lessonId: 'lesson', body: 'saved' }))
    path = '/learner/quizzes'
    await React.act(async () => render())
    assert.equal(calls.length, 4)
    account = 'two'
    await React.act(async () => render())
    assert.equal(calls.length, 5)
    assert.equal(api.state.users[0].id, 'two')
    role = 'tutor'
    account = 'tutor'
    path = '/tutor/courses/new'
    await React.act(async () => render())
    assert.equal(calls.length, 6)
    path = '/tutor/quizzes'
    await React.act(async () => render())
    assert.equal(calls.length, 7)
    path = '/tutor/courses/new'
    await React.act(async () => render())
    assert.equal(calls.length, 7)
    path = '/tutor/courses/course/edit'
    await React.act(async () => render())
    assert.equal(calls.length, 8)
    path = '/tutor/quizzes'
    await React.act(async () => render())
    path = '/tutor/courses/course/edit'
    await React.act(async () => render())
    assert.equal(calls.length, 9)
    clock += 30001
    hold = true
    path = '/tutor/quizzes'
    await React.act(async () => render())
    assert.equal(calls.length, 10)
    assert.ok(document.body.textContent.includes('Ready Snapshot 7'))
    await React.act(async () =>
      deferred.shift()({ ok: false, status: 503, json: async () => ({ error: 'Offline' }) }),
    )
    assert.ok(document.body.textContent.includes('Ready Snapshot 7'))
    assert.ok(document.body.textContent.includes('Unable to refresh'))
    await React.act(async () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Retry').click(),
    )
    assert.equal(calls.length, 11)
    await React.act(async () =>
      deferred.shift()({
        ok: true,
        json: async () => ({
          state: {
            ...structuredClone(emptyState),
            platformName: 'Updated',
            users: [{ id: account, name: account }],
          },
          hasMore: false,
        }),
      }),
    )
    assert.ok(document.body.textContent.includes('Ready Updated'))
    assert.equal(document.body.textContent.includes('Unable to refresh'), false)
    hold = false
    path = '/tutor/courses/course/edit'
    await React.act(async () => render())
    clock += 30001
    hold = true
    path = '/tutor/quizzes'
    await React.act(async () => render())
    assert.ok(document.body.textContent.includes('Ready Updated'))
    await React.act(async () =>
      deferred.shift()({ ok: false, status: 401, json: async () => ({ error: 'Please sign in' }) }),
    )
    assert.equal(document.body.textContent.includes('Ready'), false)
    assert.ok(document.body.textContent.includes('Please sign in'))
    account = 'creator'
    path = '/tutor/courses/new'
    hold = true
    await React.act(async () => render())
    assert.ok(document.querySelector('[aria-label="Draft title"]'))
    assert.equal(api.ready, false)
    const formInput = document.querySelector('[aria-label="Draft title"]')
    await React.act(async () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Type draft').click(),
    )
    await React.act(async () =>
      deferred.shift()({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Options offline' }),
      }),
    )
    assert.equal(document.querySelector('[aria-label="Draft title"]'), formInput)
    assert.equal(formInput.value, 'Draft in progress')
    await React.act(async () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Retry').click(),
    )
    const formReply = (categories) => ({
      ok: true,
      json: async () => ({
        state: {
          ...structuredClone(emptyState),
          categories,
          users: [{ id: account, name: account }],
        },
        hasMore: false,
      }),
    })
    await React.act(async () => deferred.shift()(formReply(['Cybersecurity'])))
    assert.equal(api.ready, true)
    assert.equal(document.querySelector('[aria-label="Draft title"]'), formInput)
    assert.equal(formInput.value, 'Draft in progress')
    hold = false
    path = '/tutor/quizzes'
    await React.act(async () => render())
    clock += 30001
    hold = true
    path = '/tutor/courses/new'
    await React.act(async () => render())
    assert.equal(api.ready, true)
    assert.equal(api.state.categories[0], 'Cybersecurity')
    const cachedInput = document.querySelector('[aria-label="Draft title"]')
    await React.act(async () =>
      [...document.querySelectorAll('button')].find((b) => b.textContent === 'Type draft').click(),
    )
    await React.act(async () => deferred.shift()(formReply(['Risk & Governance'])))
    assert.equal(document.querySelector('[aria-label="Draft title"]'), cachedInput)
    assert.equal(cachedInput.value, 'Draft in progress')
    assert.equal(api.state.categories[0], 'Risk & Governance')
    path = '/tutor/quizzes/new'
    await React.act(async () => render())
    assert.ok(document.querySelector('[aria-label="Draft title"]'))
    assert.equal(api.ready, false)
    await React.act(async () => deferred.shift()(formReply([])))
    assert.equal(api.ready, true)
    account = 'prefetcher'
    path = '/tutor'
    hold = false
    await React.act(async () => render())
    const baseCalls = calls.length
    hold = true
    connection.saveData = true
    assert.equal(api.prefetchSection('/tutor/quizzes'), false)
    connection.saveData = false
    connection.effectiveType = '2g'
    assert.equal(api.prefetchSection('/tutor/quizzes'), false)
    connection.effectiveType = '4g'
    assert.equal(api.prefetchSection('/admin/users'), false)
    assert.equal(api.prefetchSection('/tutor/courses/saved/edit'), false)
    assert.equal(api.prefetchSection('/tutor/quizzes'), true)
    assert.equal(api.prefetchSection('/tutor/quizzes'), false)
    assert.equal(calls.length, baseCalls + 1)
    path = '/tutor/quizzes'
    await React.act(async () => render())
    assert.equal(calls.length, baseCalls + 1)
    await React.act(async () => deferred.shift()(formReply([])))
    assert.equal(api.ready, true)
    assert.equal(calls.length, baseCalls + 1)
    path = '/tutor'
    await React.act(async () => render())
    clock += 2000
    assert.equal(api.prefetchSection('/tutor/quizzes'), false)
    assert.equal(api.prefetchSection('/tutor/certificates'), true)
    await React.act(async () => api.execute({ type: 'note', lessonId: 'unused', body: 'saved' }))
    assert.equal(deferred[0].signal.aborted, true)
    await React.act(async () => deferred.shift()(formReply([])))
    const beforeInvalidated = calls.length
    hold = false
    path = '/tutor/certificates'
    await React.act(async () => render())
    assert.equal(calls.length, beforeInvalidated + 1)
    clock += 2000
    hold = true
    assert.equal(api.prefetchSection('/tutor/courses'), true)
    await React.act(async () => deferred.shift()(formReply([])))
    assert.ok(calls.at(-1).startsWith('/api/course-list?'))
    const key = new URLSearchParams({ mode: 'managed', q: '', level: '' }).toString()
    const warmed = api.courseCache.wait(key)
    await React.act(async () =>
      deferred.shift()({
        ok: true,
        json: async () => ({
          courses: [{ id: 'warm', title: 'Prefetched course' }],
          nextCursor: null,
        }),
      }),
    )
    assert.equal((await warmed).courses[0].id, 'warm')
    assert.equal(api.courseCache.get(key).courses[0].id, 'warm')
    const beforeOpen = calls.length
    path = '/tutor/courses'
    await React.act(async () => render())
    assert.equal(calls.length, beforeOpen)
    clock += 2000
    assert.equal(api.prefetchSection('/tutor/students'), true)
    await React.act(async () =>
      deferred.shift()({
        ok: false,
        status: 503,
        json: async () => ({ error: 'Speculative failure' }),
      }),
    )
    assert.ok(document.body.textContent.includes('Ready'))
    assert.equal(document.body.textContent.includes('Speculative failure'), false)
    const beforeRetry = calls.length
    hold = false
    path = '/tutor/students'
    await React.act(async () => render())
    assert.equal(calls.length, beforeRetry + 1)
    clock += 60001
    hold = true
    const budgetCalls = calls.length
    for (let i = 0; i < 6; i++) {
      clock += 2000
      assert.equal(api.prefetchSection('/tutor/analytics'), true)
      await React.act(async () =>
        deferred.shift()({ ok: false, status: 503, json: async () => ({ error: 'Offline' }) }),
      )
    }
    clock += 2000
    assert.equal(api.prefetchSection('/tutor/analytics'), false)
    assert.equal(calls.length, budgetCalls + 6)
    clock += 60001
    assert.equal(api.prefetchSection('/tutor/analytics'), true)
    const finishCourseRequest = api.courseCache.beginRequest('foreground-course-query')
    assert.equal(deferred[0].signal.aborted, true)
    assert.equal(api.prefetchSection('/tutor/certificates'), false)
    finishCourseRequest()
    finishCourseRequest()
    const beforeAbortedNavigation = calls.length
    path = '/tutor/analytics'
    await React.act(async () => render())
    assert.equal(calls.length, beforeAbortedNavigation + 1)
    await React.act(async () => deferred.shift()(formReply([])))
    await React.act(async () => deferred.shift()(formReply([])))
    assert.equal(api.ready, true)
    clock += 2000
    assert.equal(api.prefetchSection('/tutor/users'), true)
    await React.act(async () =>
      deferred.shift()({
        ok: false,
        status: 401,
        json: async () => ({ error: 'Revoked session' }),
      }),
    )
    assert.equal(api.state.courses.length, 0)
    assert.equal(document.body.textContent.includes('Ready'), false)
    assert.ok(document.body.textContent.includes('Please sign in again'))
    account = 'course-auth-failure'
    path = '/tutor'
    hold = false
    await React.act(async () => render())
    hold = true
    assert.equal(api.prefetchSection('/tutor/courses'), true)
    await React.act(async () => deferred.shift()(formReply([])))
    await React.act(async () =>
      deferred.shift()({ ok: false, status: 403, json: async () => ({ error: 'Access revoked' }) }),
    )
    assert.equal(document.body.textContent.includes('Ready'), false)
    assert.ok(document.body.textContent.includes('Please sign in again'))
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
