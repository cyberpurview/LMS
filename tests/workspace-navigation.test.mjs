import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
test('course editors mount only after focused content arrives, protecting lesson text from list-state hydration', async () => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'),
    { createRoot } = require('react-dom/client')
  const exports = {},
    emptyState = { courses: [], users: [], notifications: [], unreadNotifications: 0 }
  let path = '/tutor/courses',
    resolveFocused
  let shellMounts = 0
  const state = (content) => ({
    ...emptyState,
    courses: [
      { id: 'course', modules: [{ lessons: [{ id: 'lesson', ...(content ? { content } : {}) }] }] },
    ],
  })
  const channel = {
    on() {
      return this
    },
    subscribe() {
      return this
    },
  }
  vm.runInNewContext(
    ts.transpileModule(
      await readFile(new URL('../src/lib/lms/store.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
        },
      },
    ).outputText,
    {
      exports,
      document,
      window,
      setTimeout,
      clearTimeout,
      setInterval,
      clearInterval,
      AbortController,
      Error,
      fetch: async () =>
        path.endsWith('/edit')
          ? await new Promise((resolve) => {
              resolveFocused = resolve
            })
          : { ok: true, json: async () => ({ state: state(), hasMore: false }) },
      require: (name) => {
        if (name === './completion-sound')
          return {
            createCompletionSoundFeed: () => () => {},
            prepareCompletionSound: () => {},
            closeCompletionSound: () => {},
          }
        if (name === 'next/navigation') return { usePathname: () => path }
        if (name === 'next/link') return { default: () => null }
        if (name === './state') return { emptyState }
        if (name === '@/components/shared/WorkspaceLoader')
          return { WorkspaceLoader: () => React.createElement('p', null, 'Loading') }
        if (name === '@/components/shared/DashboardLayout')
          return {
            DashboardLayout: ({ children }) => {
              const [collapsed, setCollapsed] = React.useState(false)
              React.useEffect(() => {
                shellMounts++
              }, [])
              return React.createElement(
                'div',
                { 'data-shell': true, 'data-collapsed': collapsed },
                React.createElement('button', { onClick: () => setCollapsed(true) }, 'Collapse'),
                children,
              )
            },
          }
        if (name === '@/components/shared/DashboardContentSkeleton')
          return {
            DashboardContentSkeleton: () =>
              React.createElement('div', { 'aria-label': 'Loading page' }, 'Loading'),
          }
        if (name === '@/lib/supabase/client')
          return { createClient: () => ({ channel: () => channel, removeChannel: async () => {} }) }
        return require(name)
      },
    },
  )
  function Editor() {
    const { state } = exports.useLms()
    const [guide] = React.useState(state.courses[0].modules[0].lessons[0].content || '')
    return React.createElement('input', { value: guide, readOnly: true })
  }
  const root = createRoot(document.getElementById('root'))
  const render = () =>
    root.render(
      React.createElement(
        exports.LmsProvider,
        { user: { id: 'tutor' } },
        path.endsWith('/edit')
          ? React.createElement(Editor)
          : React.createElement('p', null, 'List'),
      ),
    )
  try {
    await React.act(async () => {
      render()
    })
    assert.ok(document.body.textContent.includes('List'))
    const shell = document.querySelector('[data-shell]')
    await React.act(async () => document.querySelector('button').click())
    path = '/tutor/courses/course/edit'
    await React.act(async () => {
      render()
    })
    assert.equal(document.querySelector('input'), null)
    assert.ok(document.querySelector('[aria-label="Loading page"]'))
    assert.ok(document.querySelector('[data-shell]'))
    assert.equal(document.querySelector('[data-shell]'), shell)
    assert.equal(shell.dataset.collapsed, 'true')
    assert.equal(shellMounts, 1)
    await React.act(async () => {
      resolveFocused({
        ok: true,
        json: async () => ({ state: state('Saved lesson text'), hasMore: false }),
      })
    })
    assert.equal(document.querySelector('input').value, 'Saved lesson text')
    assert.equal(document.querySelector('[data-shell]'), shell)
    assert.equal(shellMounts, 1)
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
