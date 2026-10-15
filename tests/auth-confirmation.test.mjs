import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
import { requestBody } from './helpers/request-body.mjs'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const source = await readFile(
  new URL('../src/app/api/auth/confirm/route.ts', import.meta.url),
  'utf8',
)
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText
function handler(verifyOtp) {
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    require: (name) =>
      name === '@/lib/server/request-body'
        ? requestBody
        : name === '@/lib/supabase/server'
          ? { createClient: async () => ({ auth: { verifyOtp } }) }
          : require(name),
  })
  return exports.POST
}
function request(body, origin = 'http://localhost:3000') {
  return new NextRequest('http://localhost:3000/api/auth/confirm', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body),
  })
}
const token_hash = 'a'.repeat(64)
test('default email requests do not bind confirmation or recovery to a browser verifier', async () => {
  const requests = []
  const { createClient } = require('@supabase/supabase-js')
  const exports = {}
  const emailSource = await readFile(
    new URL('../src/lib/supabase/email-client.ts', import.meta.url),
    'utf8',
  )
  const code = ts.transpileModule(emailSource, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
  vm.runInNewContext(code, {
    exports,
    require: (name) =>
      name === './config'
        ? { supabaseConfig: () => ({ url: 'https://test.supabase.co', key: 'test-public-key' }) }
        : {
            createClient: (url, key, options) =>
              createClient(url, key, {
                ...options,
                global: {
                  fetch: async (url, options) => {
                    requests.push({ url: String(url), body: JSON.parse(options.body) })
                    return new Response(JSON.stringify({ user: null, session: null }), {
                      status: 200,
                      headers: { 'Content-Type': 'application/json' },
                    })
                  },
                },
              }),
          },
  })
  const client = exports.createEmailClient()
  const redirect = 'http://localhost:3000/auth/complete'
  await client.auth.signUp({
    email: 'learner@example.test',
    password: 'test-only-password',
    options: { emailRedirectTo: redirect },
  })
  await client.auth.resend({
    type: 'signup',
    email: 'learner@example.test',
    options: { emailRedirectTo: redirect },
  })
  await client.auth.resetPasswordForEmail('learner@example.test', {
    redirectTo: `${redirect}?next=/reset-password`,
  })
  assert.equal(requests.length, 3)
  for (const request of requests) {
    assert.ok(request.body.code_challenge == null)
    assert.ok(request.body.code_challenge_method == null)
    assert.match(
      new URL(request.url).searchParams.get('redirect_to'),
      /^http:\/\/localhost:3000\/auth\/complete/,
    )
  }
})
test('confirmation rejects cross-origin requests before contacting Auth', async () => {
  const post = handler(() => assert.fail('Auth must not be called'))
  assert.equal(
    (await post(request({ token_hash, type: 'email' }, 'https://other.example'))).status,
    403,
  )
})
test('malformed, oversized and unsupported confirmation requests do not reach Auth', async () => {
  const post = handler(() => assert.fail('Auth must not be called'))
  for (const body of [
    '{',
    {},
    { token_hash, type: 'admin' },
    { token_hash: '<script>', type: 'email' },
    { token_hash, type: 'email', next: 'https://other.example' },
  ])
    assert.equal((await post(request(body))).status, 400)
  assert.equal((await post(request('a'.repeat(2049)))).status, 413)
})
test('a successful token verification works without a PKCE code or browser cookie', async () => {
  const post = handler(async (input) => {
    assert.equal(input.token_hash, token_hash)
    assert.equal(input.type, 'email')
    return { data: { session: { access_token: 'test-session' } }, error: null }
  })
  const response = await post(request({ token_hash, type: 'email' }))
  assert.equal(response.status, 200)
  assert.deepEqual(await response.json(), { destination: '/api/auth/destination' })
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
})
test('recovery and invitations redirect only to password setup', async () => {
  const post = handler(async () => ({ data: { session: {} }, error: null }))
  for (const type of ['recovery', 'invite']) {
    const response = await post(request({ token_hash, type }))
    assert.deepEqual(await response.json(), { destination: '/reset-password' })
  }
})
test('used, expired or sessionless tokens cannot sign a user in', async () => {
  for (const result of [
    { data: { session: null }, error: { message: 'private-provider-detail' } },
    { data: { session: null }, error: null },
  ]) {
    const response = await handler(async () => result)(request({ token_hash, type: 'email' }))
    assert.equal(response.status, 400)
    const body = await response.json()
    assert.equal(body.destination, undefined)
    assert.match(body.error, /already used/)
    assert.doesNotMatch(body.error, /private-provider-detail/)
  }
})
