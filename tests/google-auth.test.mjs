import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
const oauth = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/supabase/oauth.ts', import.meta.url), 'utf8')),
  { exports: oauth, URL },
)
const callbackSource = compile(
  await readFile(new URL('../src/app/auth/callback/route.ts', import.meta.url), 'utf8'),
)
const destinationSource = compile(
  await readFile(new URL('../src/app/api/auth/destination/route.ts', import.meta.url), 'utf8'),
)
function callback(exchange) {
  const exports = {}
  vm.runInNewContext(callbackSource, {
    exports,
    URL,
    require: (name) =>
      name === '@/lib/supabase/server'
        ? { createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }) }
        : require(name),
  })
  return exports.GET
}
function destination(role) {
  const exports = {}
  vm.runInNewContext(destinationSource, {
    exports,
    URL,
    require: (name) =>
      name === '@/lib/server/auth'
        ? { getIdentity: async () => (role ? { user: { role } } : null) }
        : name === '@/lib/supabase/oauth'
          ? oauth
          : require(name),
  })
  return exports.GET
}
const request = (path) => new NextRequest('http://localhost:3000' + path)
test('Google uses SSR-compatible PKCE cookies and the same-origin callback', async () => {
  const { createBrowserClient } = require('@supabase/ssr')
  const cookies = new Map()
  const client = createBrowserClient('https://test.supabase.co', 'test-public-key', {
    isSingleton: false,
    auth: { autoRefreshToken: false, detectSessionInUrl: false },
    cookies: {
      getAll: () => Array.from(cookies, ([name, value]) => ({ name, value })),
      setAll: (values) => values.forEach(({ name, value }) => cookies.set(name, value)),
    },
  })
  const result = await client.auth.signInWithOAuth(
    oauth.googleOAuthOptions('http://localhost:3000', '/learner/catalog?q=security'),
  )
  assert.equal(result.error, null)
  const authorize = new URL(result.data.url)
  assert.equal(authorize.searchParams.get('provider'), 'google')
  assert.equal(authorize.searchParams.get('code_challenge_method'), 's256')
  assert.ok(authorize.searchParams.get('code_challenge'))
  assert.ok(Array.from(cookies.keys()).some((name) => name.includes('code-verifier')))
  const redirect = new URL(authorize.searchParams.get('redirect_to'))
  assert.equal(redirect.pathname, '/auth/callback')
  assert.equal(redirect.searchParams.get('provider'), 'google')
  assert.equal(redirect.searchParams.get('next'), '/learner/catalog?q=security')
  assert.equal(authorize.searchParams.get('prompt'), 'select_account')
})
test('OAuth callback exchanges a code and preserves the requested workspace', async () => {
  let exchanged
  const get = callback(async (code) => {
    exchanged = code
    return { data: { session: { access_token: 'test' } }, error: null }
  })
  const response = await get(
    request('/auth/callback?provider=google&code=test-code&next=%2Flearner%2Fcatalog'),
  )
  assert.equal(exchanged, 'test-code')
  const target = new URL(response.headers.get('location'))
  assert.equal(target.pathname, '/api/auth/destination')
  assert.equal(target.searchParams.get('next'), '/learner/catalog')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(response.headers.get('referrer-policy'), 'no-referrer')
})
test('cancelled, expired, missing and sessionless OAuth results return useful sign-in errors', async () => {
  const denied = callback(() => assert.fail('Cancelled sign-in must not exchange a code'))
  assert.match(
    (await denied(request('/auth/callback?provider=google&error=access_denied'))).headers.get(
      'location',
    ),
    /error=oauth_cancelled/,
  )
  for (const exchange of [
    async () => ({ data: { session: null }, error: new Error('Expired') }),
    async () => ({ data: { session: null }, error: null }),
    async () => {
      throw new Error('Network')
    },
  ]) {
    assert.match(
      (await callback(exchange)(request('/auth/callback?provider=google&code=test'))).headers.get(
        'location',
      ),
      /error=oauth_session/,
    )
  }
  assert.match(
    (await denied(request('/auth/callback?provider=google'))).headers.get('location'),
    /error=oauth_session/,
  )
})
test('provider failures are not mislabeled as cancellation or reflected into the redirect', async () => {
  const get = callback(() => assert.fail('Provider failures must not exchange a code'))
  for (const query of [
    'error=server_error&error_description=Unable+to+exchange+external+code',
    'error=access_denied&error_code=signup_disabled',
    'error=unexpected_failure&error_description=private-provider-details',
  ]) {
    const response = await get(request('/auth/callback?provider=google&' + query))
    const target = new URL(response.headers.get('location'))
    assert.equal(target.pathname, '/login')
    assert.equal(target.search, '?error=oauth_provider')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
  }
})
test('role-based destinations reject external, cross-role and normalized traversal paths', async () => {
  for (const role of ['admin', 'tutor', 'learner']) {
    const get = destination(role)
    for (const next of [
      'https://evil.example',
      '//evil.example',
      '/learner/../../admin',
      '/learner\\evil',
      '/tutor/courses',
      '/admin/users',
    ]) {
      const response = await get(request('/api/auth/destination?next=' + encodeURIComponent(next)))
      const target = new URL(response.headers.get('location'))
      assert.equal(target.origin, 'http://localhost:3000')
      assert.ok(target.pathname === `/${role}` || target.pathname.startsWith(`/${role}/`))
    }
    const response = await get(
      request('/api/auth/destination?next=' + encodeURIComponent(`/${role}/courses?q=security`)),
    )
    assert.equal(new URL(response.headers.get('location')).pathname, `/${role}/courses`)
    assert.equal(new URL(response.headers.get('location')).search, '?q=security')
  }
  assert.equal(
    new URL((await destination(null)(request('/api/auth/destination'))).headers.get('location'))
      .pathname,
    '/login',
  )
})
test('existing email callback and recovery routes remain compatible', async () => {
  const get = callback(async () => ({ data: { session: { access_token: 'test' } }, error: null }))
  assert.equal(
    new URL(
      (await get(request('/auth/callback?code=test&next=/reset-password'))).headers.get('location'),
    ).pathname,
    '/reset-password',
  )
  assert.equal(
    new URL((await get(request('/auth/callback?code=test'))).headers.get('location')).pathname,
    '/api/auth/destination',
  )
})

test('oversized codes and malformed flow IDs never reach the OAuth exchange', async () => {
  let calls = 0
  const get = callback(async () => {
    calls++
    return { data: { session: null } }
  })
  for (const query of [
    `code=${'a'.repeat(2049)}`,
    `code=test&sb_flow_id=${encodeURIComponent('bad/flow')}`,
  ]) {
    const response = await get(request(`/auth/callback?provider=google&${query}`))
    assert.equal(new URL(response.headers.get('location')).pathname, '/login')
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
  }
  assert.equal(calls, 0)
})

test('Google button starts OAuth without requiring email and displays provider errors', async () => {
  const loginSource = compile(
    await readFile(new URL('../src/app/login/page.tsx', import.meta.url), 'utf8'),
  )
  for (const fail of [false, true]) {
    const exports = {}
    const slots = []
    let index = 0
    const events = []
    const window = {
      location: {
        origin: 'http://localhost:3000',
        search: '?next=%2Flearner%2Fcatalog',
        assign: (url) => events.push(['navigate', url]),
      },
    }
    vm.runInNewContext(loginSource, {
      exports,
      window,
      URLSearchParams,
      Error,
      require: (name) => {
        if (name === 'react')
          return {
            ...require('react'),
            useEffect: () => {},
            useState: (initial) => {
              const slot = index++
              if (!(slot in slots)) slots[slot] = initial
              return [slots[slot], (value) => (slots[slot] = value)]
            },
          }
        if (name === '@/lib/supabase/client')
          return {
            createClient: () => ({
              auth: {
                signInWithOAuth: async (options) => {
                  events.push(['oauth', options])
                  return {
                    data: { url: 'https://test.supabase.co/auth/v1/authorize' },
                    error: fail ? new Error('Google is unavailable') : null,
                  }
                },
              },
            }),
          }
        if (name === '@/lib/supabase/oauth') return oauth
        if (name === '@/lib/supabase/email-client') return {}
        if (name === '@/components/shared/BrandLogo') return { BrandLogo: 'BrandLogo' }
        return require(name)
      },
    })
    const nodes = (node) =>
      !node || typeof node !== 'object'
        ? []
        : Array.isArray(node)
          ? node.flatMap(nodes)
          : [node, ...nodes(node.props?.children)]
    const render = () => {
      index = 0
      return nodes(exports.default())
    }
    const button = render().find(
      (n) => n.type === 'button' && n.props.children?.includes('Continue with Google'),
    )
    assert.ok(button)
    assert.equal(button.props.type, 'button')
    await button.props.onClick()
    assert.equal(events[0][1].provider, 'google')
    if (fail) {
      assert.equal(
        render().find((n) => n.props?.role === 'alert').props.children,
        'Google is unavailable',
      )
      assert.equal(events.length, 1)
      assert.equal(
        render().find(
          (n) => n.type === 'button' && n.props.children?.includes('Continue with Google'),
        ).props.disabled,
        false,
      )
    } else assert.equal(events[1][0], 'navigate')
  }
})

test('callback forwards an explicit PKCE flow ID to select the matching verifier', async () => {
  let options
  const get = callback(async (_code, input) => {
    options = input
    return { data: { session: { access_token: 'test' } }, error: null }
  })
  const response = await get(
    request('/auth/callback?provider=google&code=test&sb_flow_id=flow-test'),
  )
  assert.equal(options.flowId, 'flow-test')
  assert.equal(new URL(response.headers.get('location')).pathname, '/api/auth/destination')
})
