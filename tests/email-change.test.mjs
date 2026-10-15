import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestBody } from './helpers/request-body.mjs'
const require = createRequire(import.meta.url),
  { NextRequest } = require('next/server')
const compile = (s) =>
  ts.transpileModule(s, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
const route = compile(
  await readFile(new URL('../src/app/api/auth/email-change/route.ts', import.meta.url), 'utf8'),
)
const confirmation = compile(
  await readFile(
    new URL('../src/app/api/auth/email-change/confirm/route.ts', import.meta.url),
    'utf8',
  ),
)
const uid = '11111111-1111-4111-8111-111111111111'
function setup({
  signedIn = true,
  verifiedId = uid,
  expired = false,
  quota = false,
  partial = false,
  enabled = true,
} = {}) {
  const events = [],
    exports = {},
    confirmExports = {}
  const auth = {
    signInWithOtp: async (args) => {
      events.push(['send', args])
      return { error: null }
    },
    verifyOtp: async (args) => {
      events.push(['verify', args])
      return expired
        ? { data: { user: null, session: null }, error: new Error('Expired') }
        : {
            data: {
              user: { id: verifiedId, email: 'current@example.test' },
              session: partial ? null : { access_token: 'temporary' },
            },
            error: null,
          }
    },
    signOut: async (args) => {
      events.push(['signOut', args])
      return { error: null }
    },
  }
  const client = {
    rpc: async (name, args) => {
      events.push([name, args])
      return { error: quota ? new Error('Rate limit') : null }
    },
    auth: {
      getUser: async () => ({
        data: {
          user: {
            email: 'current@example.test',
            new_email: '',
            identities: [{ provider: 'google' }],
          },
        },
        error: null,
      }),
      updateUser: async (args, options) => {
        events.push(['update', args, options])
        return { error: null }
      },
    },
  }
  const context = (exports) => ({
    exports,
    process: { env: { AUTH_EMAIL_CHANGE_ENABLED: enabled ? 'true' : 'false' } },
    require: (name) => {
      if (name === '@/lib/server/request-body') return requestBody
      if (name === '@/lib/server/auth')
        return {
          getIdentity: async () =>
            signedIn ? { client, user: { id: uid, email: 'current@example.test' } } : null,
        }
      if (name === '@/lib/supabase/email-client') return { createEmailClient: () => ({ auth }) }
      if (name === '@/lib/server/storage')
        return {
          storageAdmin: () => ({
            rpc: async (name, args) => {
              events.push([name, args])
              return { error: null }
            },
          }),
        }
      return require(name)
    },
  })
  vm.runInNewContext(route, context(exports))
  vm.runInNewContext(confirmation, context(confirmExports))
  const request = (body, origin = 'http://localhost:3000') =>
    new NextRequest('http://localhost:3000/api/auth/email-change', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  return {
    events,
    post: (body) => exports.POST(request(body)),
    crossOrigin: (body) => exports.POST(request(body, 'https://attacker.example')),
    get: exports.GET,
    confirm: (body) => confirmExports.POST(request(body)),
  }
}
test('email changes authenticate, enforce origin and rate-limit before sending codes', async () => {
  const anonymous = setup({ signedIn: false })
  assert.equal((await anonymous.post({ action: 'send' })).status, 401)
  assert.equal(anonymous.events.length, 0)
  const foreign = setup()
  assert.equal((await foreign.crossOrigin({ action: 'send' })).status, 403)
  assert.equal(foreign.events.length, 0)
  const limited = setup({ quota: true })
  assert.equal((await limited.post({ action: 'send' })).status, 429)
  assert.equal(
    limited.events.some((e) => e[0] === 'send'),
    false,
  )
  const normal = setup()
  assert.equal((await normal.post({ action: 'send' })).status, 200)
  assert.equal(normal.events[1][1].email, 'current@example.test')
  assert.equal(normal.events[1][1].options.shouldCreateUser, false)
})
test('only a fresh OTP belonging to the current account grants a target-specific email change', async () => {
  const input = { action: 'change', email: 'NEW@example.test', code: '123456' }
  for (const options of [{ expired: true }, { verifiedId: 'another-user' }]) {
    const app = setup(options)
    assert.equal((await app.post(input)).status, 400)
    assert.equal(
      app.events.some((e) => e[0] === 'authorize_email_change' || e[0] === 'update'),
      false,
    )
  }
  const app = setup()
  assert.equal((await app.post(input)).status, 200)
  const names = app.events.map((e) => e[0])
  assert.ok(names.indexOf('verify') < names.indexOf('authorize_email_change'))
  assert.ok(names.indexOf('signOut') < names.indexOf('authorize_email_change'))
  assert.equal(app.events.find((e) => e[0] === 'signOut')[1].scope, 'local')
  assert.equal(
    app.events.find((e) => e[0] === 'authorize_email_change')[1].new_email,
    'new@example.test',
  )
  assert.equal(app.events.find((e) => e[0] === 'authorize_email_change')[1].user_id, uid)
  assert.equal(
    app.events.find((e) => e[0] === 'update')[2].emailRedirectTo,
    'http://localhost:3000/auth/confirm',
  )
})
test('confirmation accepts the first address without a session and signs out after final confirmation', async () => {
  const token_hash = 'a'.repeat(64)
  const first = setup({ partial: true }),
    response = await first.confirm({ token_hash })
  assert.equal(response.status, 200)
  assert.equal((await response.json()).complete, false)
  assert.equal(
    first.events.some((e) => e[0] === 'signOut'),
    false,
  )
  const last = setup(),
    complete = await last.confirm({ token_hash })
  assert.equal(complete.status, 200)
  assert.equal((await complete.json()).complete, true)
  assert.equal(last.events.find((e) => e[0] === 'signOut')[1].scope, 'global')
  assert.equal(last.events.find((e) => e[0] === 'verify')[1].type, 'email_change')
  const expired = setup({ expired: true })
  assert.equal((await expired.confirm({ token_hash })).status, 400)
})
test('pending status and cancellation are bound to the signed-in account', async () => {
  const app = setup(),
    response = await app.get()
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal((await response.json()).linkedGoogle, true)
  assert.equal((await app.post({ action: 'cancel', user_id: 'someone-else' })).status, 200)
  assert.equal(app.events.find((e) => e[0] === 'cancel_email_change')[1].user_id, uid)
})
test('unconfigured email delivery blocks new changes but still permits cancellation', async () => {
  const app = setup({ enabled: false })
  assert.equal((await (await app.get()).json()).available, false)
  assert.equal((await app.post({ action: 'send' })).status, 503)
  assert.equal(
    (await app.post({ action: 'change', email: 'new@example.test', code: '123456' })).status,
    503,
  )
  assert.equal(app.events.length, 0)
  assert.equal((await app.post({ action: 'cancel' })).status, 200)
})
