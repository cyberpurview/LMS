import { courseUrlExports } from './helpers/course-url.mjs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const compile = (s, fileName = 'component.tsx') =>
  ts.transpileModule(s, {
    fileName,
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText

test('course browser appends batches, blocks repeated clicks, retries failures and discards stale filter results', async () => {
  const { JSDOM } = require('jsdom'),
    dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'),
    { createRoot } = require('react-dom/client'),
    { act } = React
  const requests = [],
    exports = {},
    params = new URLSearchParams()
  const cachedPages = new Map()
  const courseCache = {
    get: (key) => cachedPages.get(key),
    set: (key, value) => cachedPages.set(key, { ...value, stale: false }),
    delete: (key) => cachedPages.delete(key),
  }
  const pass = ({ children }) => React.createElement('div', null, children)
  vm.runInNewContext(
    compile(
      await readFile(
        new URL('../src/components/features/course-browser.tsx', import.meta.url),
        'utf8',
      ),
    ),
    {
      exports,
      URLSearchParams,
      AbortController,
      Map,
      Error,
      setTimeout,
      clearTimeout,
      fetch: (url, options) => new Promise((resolve) => requests.push({ url, options, resolve })),
      require: (name) => {
        if (name === '@/lib/lms/course-url') return courseUrlExports
        if (name === 'next/link')
          return { default: ({ children, ...props }) => React.createElement('a', props, children) }
        if (name === 'next/navigation')
          return { useRouter: () => ({ push() {} }), useSearchParams: () => params }
        if (name === '@/lib/lms/store')
          return { useLms: () => ({ state: { categories: ['Cybersecurity'] }, courseCache }) }
        if (name === '@/lib/lms/course-browse') return { COURSE_BATCH_SIZE: 12 }
        if (name === '@/components/shared/ui')
          return { CourseCard: ({ title }) => React.createElement('article', null, title) }
        if (name === './common')
          return {
            FeatureShell: pass,
            Heading: pass,
            Empty: () => React.createElement('p', null, 'Empty'),
            SearchField: ({ onChange }) =>
              React.createElement('button', { onClick: () => onChange('rare') }, 'Search rare'),
            primaryClass: '',
            secondaryClass: '',
            inputClass: '',
          }
        return require(name)
      },
    },
  )
  let root = createRoot(document.getElementById('root'))
  const settle = () => new Promise((resolve) => setTimeout(resolve, 15))
  const cards = (n) =>
    Array.from({ length: n }, (_, i) => ({ id: `id-${i}`, title: `Course ${i}` }))
  const reply = async (index, data, status = 200) => {
    await act(async () => {
      requests[index].resolve(
        new Response(JSON.stringify(data), {
          status,
          headers: { 'Content-Type': 'application/json' },
        }),
      )
      await settle()
    })
  }
  const button = (text) =>
    [...document.querySelectorAll('button')].find((b) => b.textContent === text)
  await act(async () => {
    root.render(React.createElement(exports.CourseBrowser, { role: 'learner', catalog: true }))
    await settle()
  })
  await act(settle)
  assert.equal(requests.length, 1)
  await reply(0, { courses: cards(12), nextCursor: 'cursor-12' })
  assert.equal(document.querySelectorAll('article').length, 12)
  await act(async () => {
    button('Load more courses').click()
    button('Load more courses').click()
  })
  assert.equal(requests.length, 2)
  assert.ok(requests[1].url.includes('cursor=cursor-12'))
  await reply(1, { error: 'Temporary failure' }, 503)
  assert.equal(document.querySelectorAll('article').length, 12)
  await act(async () => button('Try again').click())
  await reply(2, { courses: [{ id: 'id-12', title: 'Course 12' }], nextCursor: 'cursor-13' })
  assert.equal(document.querySelectorAll('article').length, 13)
  await act(async () => button('Load more courses').click())
  await act(async () => {
    button('Search rare').click()
    await settle()
  })
  assert.equal(requests[3].options.signal.aborted, true)
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 320))
  })
  assert.equal(requests.length, 5)
  assert.ok(requests[4].url.includes('q=rare'))
  assert.equal(requests[4].url.includes('cursor='), false)
  await reply(4, { courses: [{ id: 'rare', title: 'Rare match' }], nextCursor: null })
  await reply(3, { courses: [{ id: 'stale', title: 'Stale course' }], nextCursor: null })
  assert.equal(document.querySelectorAll('article').length, 1)
  assert.ok(document.body.textContent.includes('Rare match'))
  assert.equal(document.body.textContent.includes('Stale course'), false)
  assert.equal(button('Load more courses'), undefined)
  await act(async () => root.unmount())
  for (const entry of cachedPages.values()) entry.stale = true
  root = createRoot(document.getElementById('root'))
  await act(async () =>
    root.render(React.createElement(exports.CourseBrowser, { role: 'learner', catalog: true })),
  )
  assert.equal(document.querySelectorAll('article').length, 13)
  assert.equal(requests.length, 6)
  const freshCards = cards(12).map((c) => ({ ...c, title: `Updated ${c.title}` }))
  await reply(5, { courses: freshCards, nextCursor: 'fresh-page-2' })
  assert.equal(requests.length, 7)
  assert.equal(document.querySelectorAll('article').length, 13)
  await reply(6, { error: 'Refresh offline' }, 503)
  assert.equal(document.querySelectorAll('article').length, 13)
  await act(async () => button('Try again').click())
  assert.equal(requests[7].url.includes('cursor='), false)
  await reply(7, { courses: freshCards, nextCursor: 'fresh-page-2' })
  await reply(8, {
    courses: [{ id: 'id-12', title: 'Updated Course 12' }],
    nextCursor: 'fresh-page-3',
  })
  assert.equal(document.querySelectorAll('article').length, 13)
  assert.ok(document.body.textContent.includes('Updated Course 12'))
  await act(async () => root.unmount())
  for (const entry of cachedPages.values()) entry.stale = true
  root = createRoot(document.getElementById('root'))
  await act(async () =>
    root.render(React.createElement(exports.CourseBrowser, { role: 'learner', catalog: true })),
  )
  await reply(9, { error: 'Please sign in' }, 401)
  assert.equal(document.querySelectorAll('article').length, 0)
  await act(async () => root.unmount())
  dom.window.close()
})

test('catalog workspace shell never requests bulk courses, enrollments, quizzes or curriculum', async () => {
  const exports = {},
    calls = []
  const chain = (name) => ({
    select() {
      return this
    },
    order: async () => ({ data: [{ name: 'Cybersecurity' }], error: null }),
    single: async () => ({ data: { platform_name: 'CyberPurview' }, error: null }),
  })
  const client = {
    from: (name) => {
      calls.push(name)
      return chain(name)
    },
    rpc: async (name) => {
      calls.push(name)
      return { data: { notifications: [], unreadCount: 0 }, error: null }
    },
  }
  vm.runInNewContext(
    compile(
      await readFile(new URL('../src/lib/server/workspace.ts', import.meta.url), 'utf8'),
      'workspace.ts',
    ),
    {
      exports,
      structuredClone,
      require: (name) =>
        name === 'server-only'
          ? {}
          : name === '@/lib/lms/state'
            ? {
                emptyState: {
                  courses: [],
                  quizzes: [],
                  enrollments: [],
                  users: [],
                  notifications: [],
                },
              }
            : name === '@/lib/supabase/config'
              ? { supabaseConfig: () => ({}) }
              : name === '@/lib/lms/thumbnail'
                ? {}
                : require(name),
    },
  )
  const result = await exports.loadWorkspace(
    client,
    { id: 'learner', name: 'Learner' },
    0,
    '/learner/catalog',
  )
  assert.deepEqual(calls.sort(), ['categories', 'notification_feed', 'platform_settings'])
  assert.equal(result.state.courses.length, 0)
  assert.equal(result.hasMore, false)
})

test('course list API authenticates and fixes the batch size even when a caller requests more', async () => {
  const source = compile(
    await readFile(new URL('../src/app/api/course-list/route.ts', import.meta.url), 'utf8'),
    'route.ts',
  )
  let signedIn = false
  const calls = [],
    exports = {}
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === '@/lib/lms/course-url') return courseUrlExports
      if (name === '@/lib/lms/course-browse') return { COURSE_BATCH_SIZE: 12 }
      if (name === '@/lib/server/auth')
        return {
          getIdentity: async () =>
            signedIn
              ? {
                  client: {
                    rpc: async (name, args) => {
                      calls.push({ name, args })
                      return { data: { courses: [], nextCursor: null }, error: null }
                    },
                  },
                }
              : null,
        }
      return require(name)
    },
  })
  const request = new NextRequest('http://localhost:3000/api/course-list?mode=catalog&limit=10000')
  assert.equal((await exports.GET(request)).status, 401)
  assert.equal(calls.length, 0)
  signedIn = true
  const response = await exports.GET(request)
  assert.equal(response.status, 200)
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(calls[0].name, 'browse_courses')
  assert.equal(calls[0].args.page_size, 12)
  assert.equal(
    (
      await exports.GET(
        new NextRequest('http://localhost:3000/api/course-list?mode=catalog&cursor=invalid'),
      )
    ).status,
    400,
  )
  assert.equal(calls.length, 1)
})
