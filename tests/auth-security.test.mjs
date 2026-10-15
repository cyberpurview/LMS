import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
const require = createRequire(import.meta.url)
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
test('middleware rejects unverified claims, preserves refreshed cookies and protects auth-page caching', async () => {
  const { NextRequest } = require('next/server')
  const source = compile(await readFile(new URL('../src/middleware.ts', import.meta.url), 'utf8'))
  for (const authenticated of [false, true]) {
    const exports = {}
    vm.runInNewContext(source, {
      exports,
      URL,
      require: (name) => {
        if (name === '@/lib/supabase/config')
          return {
            supabaseConfig: () => ({ url: 'https://example.supabase.co', key: 'public-test-key' }),
          }
        if (name === '@supabase/ssr')
          return {
            createServerClient: (_url, _key, options) => ({
              auth: {
                getClaims: async () => {
                  options.cookies.setAll([
                    {
                      name: 'test-session',
                      value: 'refreshed',
                      options: { sameSite: 'lax', path: '/' },
                    },
                  ])
                  return { data: authenticated ? { claims: { sub: 'learner' } } : null }
                },
              },
            }),
          }
        return require(name)
      },
    })
    const response = await exports.middleware(
      new NextRequest('http://localhost:3000/admin?view=test'),
    )
    if (!authenticated) {
      const redirect = new URL(response.headers.get('location'))
      assert.equal(redirect.pathname, '/login')
      assert.equal(redirect.searchParams.get('next'), '/admin?view=test')
    }
    assert.ok(response.headers.get('set-cookie').includes('test-session=refreshed'))
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    const login = await exports.middleware(new NextRequest('http://localhost:3000/login'))
    assert.equal(login.headers.get('referrer-policy'), 'no-referrer')
  }
})
test('email session links scrub credentials, wait for explicit confirmation and reject mismatched refresh accounts', async () => {
  const { JSDOM } = require('jsdom'),
    React = require('react'),
    { createRoot } = require('react-dom/client')
  const source = compile(
    await readFile(
      new URL('../src/components/features/email-session-confirm.tsx', import.meta.url),
      'utf8',
    ),
  )
  for (const mismatch of [false, true]) {
    const dom = new JSDOM('<!doctype html><div id="root"></div>', { pretendToBeVisual: true })
    globalThis.window = dom.window
    globalThis.document = dom.window.document
    globalThis.IS_REACT_ACT_ENVIRONMENT = true
    const events = [],
      exports = {}
    const window = {
      location: {
        hash: '#access_token=link-access&refresh_token=link-refresh&type=recovery',
        pathname: '/auth/complete',
        replace: (url) => events.push(['navigate', url]),
      },
      history: {
        replaceState() {
          window.location.hash = ''
          events.push(['scrub'])
        },
      },
    }
    vm.runInNewContext(source, {
      exports,
      window,
      URLSearchParams,
      Error,
      require: (name) => {
        if (name === '@/lib/supabase/client')
          return {
            createClient: () => ({
              auth: {
                getUser: async () => ({
                  data: { user: { id: 'account-A', email: 'learner@example.test' } },
                }),
                setSession: async (session) => {
                  events.push(['persist', session])
                  return { data: { session, user: { id: 'account-A' } } }
                },
              },
            }),
          }
        if (name === '@/lib/supabase/email-client')
          return {
            createEmailClient: () => ({
              auth: {
                refreshSession: async () => {
                  events.push(['refresh'])
                  return {
                    data: {
                      session: { access_token: 'fresh-access', refresh_token: 'fresh-refresh' },
                      user: { id: mismatch ? 'account-B' : 'account-A' },
                    },
                  }
                },
              },
            }),
          }
        if (name === 'next/link')
          return { default: ({ children, ...props }) => React.createElement('a', props, children) }
        if (name === '@/components/shared/BrandLogo')
          return { BrandLogo: () => React.createElement('span', null, 'CyberPurview') }
        return require(name)
      },
    })
    const root = createRoot(document.getElementById('root'))
    try {
      await React.act(async () =>
        root.render(
          React.createElement(
            React.StrictMode,
            null,
            React.createElement(exports.EmailSessionConfirm),
          ),
        ),
      )
      assert.equal(window.location.hash, '')
      assert.ok(document.body.textContent.includes('learner@example.test'))
      assert.equal(events.filter((e) => e[0] === 'persist' || e[0] === 'refresh').length, 0)
      assert.ok(!document.body.innerHTML.includes('link-refresh'))
      await React.act(async () => document.querySelector('button').click())
      if (mismatch) {
        assert.equal(events.filter((e) => e[0] === 'persist').length, 0)
        assert.ok(document.querySelector('[role="alert"]'))
      } else {
        assert.equal(events.find((e) => e[0] === 'persist')[1].access_token, 'fresh-access')
        assert.equal(events.find((e) => e[0] === 'navigate')[1], '/reset-password')
      }
    } finally {
      await React.act(async () => root.unmount())
      dom.window.close()
      globalThis.IS_REACT_ACT_ENVIRONMENT = false
    }
  }
})
test('password updates handle required verification and sign out all sessions after success', async () => {
  const source = compile(
    await readFile(new URL('../src/app/reset-password/page.tsx', import.meta.url), 'utf8'),
  )
  const exports = {},
    slots = [],
    events = []
  let index = 0,
    attempts = 0
  vm.runInNewContext(source, {
    exports,
    Error,
    require: (name) => {
      if (name === 'react')
        return {
          ...require('react'),
          useState: (initial) => {
            const n = index++
            if (!(n in slots)) slots[n] = initial
            return [
              slots[n],
              (value) => {
                slots[n] = value
              },
            ]
          },
        }
      if (name === '@/lib/supabase/client')
        return {
          createClient: () => ({
            auth: {
              getUser: async () => ({ data: { user: { id: 'learner' } } }),
              updateUser: async (args) => {
                events.push(['update', args])
                return {
                  error:
                    attempts++ === 0
                      ? { code: 'reauthentication_needed', message: 'Verification required' }
                      : null,
                }
              },
              reauthenticate: async () => {
                events.push(['reauthenticate'])
                return {}
              },
              signOut: async (args) => {
                events.push(['signOut', args])
                return {}
              },
            },
          }),
        }
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
    return nodes(exports.default())
  }
  render()
    .find((n) => n.type === 'input')
    .props.onChange({ target: { value: 'strong-test-password' } })
  await render()
    .find((n) => n.type === 'form')
    .props.onSubmit({ preventDefault() {} })
  assert.equal(events.filter((e) => e[0] === 'reauthenticate').length, 0)
  await render()
    .find((n) => n.type === 'button' && n.props.children === 'Send verification code')
    .props.onClick()
  render()
    .find((n) => n.type === 'input' && n.props.autoComplete === 'one-time-code')
    .props.onChange({ target: { value: '123456' } })
  await render()
    .find((n) => n.type === 'form')
    .props.onSubmit({ preventDefault() {} })
  assert.equal(events.filter((e) => e[0] === 'update').at(-1)[1].nonce, '123456')
  assert.equal(events.find((e) => e[0] === 'signOut')[1].scope, 'global')
  assert.equal(render().find((n) => n.type === 'input').props.value, '')
})
