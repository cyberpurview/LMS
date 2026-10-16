import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)

test('sidebar prefetch waits for hover or keyboard intent, cancels quick passes and disables viewport prefetch', async () => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<div id="root"></div>')
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'),
    { createRoot } = require('react-dom/client')
  const exports = {},
    links = new Map(),
    timers = new Map(),
    events = []
  let timerId = 0,
    accepted = true
  vm.runInNewContext(
    ts.transpileModule(
      await readFile(new URL('../src/components/shared/Sidebar.tsx', import.meta.url), 'utf8'),
      {
        compilerOptions: {
          module: ts.ModuleKind.CommonJS,
          esModuleInterop: true,
          jsx: ts.JsxEmit.ReactJSX,
          target: ts.ScriptTarget.ES2022,
        },
      },
    ).outputText,
    {
      exports,
      setTimeout: (fn, delay) => {
        assert.equal(delay, 180)
        timers.set(++timerId, fn)
        return timerId
      },
      clearTimeout: (id) => timers.delete(id),
      require: (name) => {
        if (name === 'next/navigation')
          return {
            usePathname: () => '/tutor',
            useRouter: () => ({ prefetch: (path) => events.push(['route', path]) }),
          }
        if (name === '@/lib/lms/store')
          return {
            useLms: () => ({
              prefetchSection: (path) => {
                events.push(['data', path])
                return accepted
              },
            }),
          }
        if (name === 'next/link')
          return {
            __esModule: true,
            default: ({ children, prefetch, ...props }) => {
              links.set(props.href, { ...props, prefetch })
              return React.createElement('a', props, children)
            },
          }
        if (name === '@/lib/utils')
          return { cn: (...values) => values.filter((v) => typeof v === 'string').join(' ') }
        if (name === 'lucide-react') return new Proxy({}, { get: () => () => null })
        if (name === './BrandLogo') return { BrandLogo: () => null }
        return require(name)
      },
    },
  )
  const root = createRoot(document.getElementById('root'))
  try {
    await React.act(async () =>
      root.render(React.createElement(exports.Sidebar, { role: 'tutor' })),
    )
    const link = links.get('/tutor/quizzes')
    assert.equal(link.prefetch, false)
    link.onMouseEnter()
    assert.equal(events.length, 0)
    link.onMouseLeave()
    assert.equal(timers.size, 0)
    link.onFocus()
    const run = [...timers.values()][0]
    timers.clear()
    run()
    assert.deepEqual(events, [
      ['data', '/tutor/quizzes'],
      ['route', '/tutor/quizzes'],
    ])
    accepted = false
    link.onMouseEnter()
    const skip = [...timers.values()][0]
    timers.clear()
    skip()
    assert.equal(events.filter((e) => e[0] === 'route').length, 1)
    link.onFocus()
    link.onBlur()
    assert.equal(timers.size, 0)
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
