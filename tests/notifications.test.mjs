import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { NextRequest } from 'next/server.js'
const require = createRequire(import.meta.url)
const uid = '11111111-1111-4111-8111-111111111111'
async function route(file, overrides = {}) {
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(await readFile(new URL(file, import.meta.url), 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS },
    }).outputText,
    {
      exports,
      URL,
      URLSearchParams,
      Buffer,
      AbortSignal,
      Date,
      Error,
      setTimeout: (run) => {
        run()
        return 0
      },
      process: { env: overrides.env || {} },
      fetch:
        overrides.fetch ||
        (() => {
          throw new Error('Unexpected network request')
        }),
      require: (name) => {
        if (name === '@/lib/server/course-resource-cleanup')
          return { cleanupCourseResources: async () => 0 }
        if (name === '@/lib/server/auth')
          return { getIdentity: async () => overrides.identity || null }
        if (name === '@/lib/server/storage') return { storageAdmin: () => overrides.client }
        if (name === '@/lib/brand') return { BRAND_NAME: 'CyberPurview' }
        return require(name)
      },
    },
  )
  return exports.GET
}
test('notification API authenticates, validates cursors and returns a bounded private feed', async () => {
  const path = '../src/app/api/notifications/route.ts'
  const request = (query = '') => new NextRequest(`http://localhost:3000/api/notifications${query}`)
  assert.equal((await (await route(path))(request())).status, 401)
  const calls = []
  const client = {
    rpc: async (name, args) => {
      calls.push([name, args])
      return {
        data: {
          notifications: Array.from({ length: 51 }, (_, i) => ({
            id: String(i),
            user_id: uid,
            created_at: '2026-10-11T00:00:00Z',
            is_read: false,
            href: '/learner',
            event_key: 'ai-generation:11111111-1111-4111-8111-111111111111:complete',
          })),
          unreadCount: 120,
        },
      }
    },
  }
  const get = await route(path, { identity: { client } })
  const response = await get(request('?unread=true'))
  const feed = await response.json()
  assert.equal(feed.notifications.length, 50)
  assert.equal(feed.hasMore, true)
  assert.equal(feed.unreadCount, 120)
  assert.equal(feed.notifications[0].userId, uid)
  assert.equal(feed.completionSound, false)
  assert.equal(
    feed.notifications[0].eventKey,
    'ai-generation:11111111-1111-4111-8111-111111111111:complete',
  )
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  assert.equal(calls[0][1].unread_only, true)
  assert.equal((await get(request('?beforeTime=invalid&beforeId=invalid'))).status, 400)
  assert.equal(calls.length, 1)
  const enabled = await route(path, {
    identity: { client, preferences: { aiCompletionSound: true } },
  })
  assert.equal((await (await enabled(request())).json()).completionSound, true)
})
test('email worker fails closed without authorization or configuration and retries with stable keys', async () => {
  const path = '../src/app/api/cron/notification-emails/route.ts'
  const request = (token) =>
    new NextRequest('http://localhost:3000/api/cron/notification-emails', {
      headers: token ? { authorization: token } : {},
    })
  const disabled = await route(path, { env: { CRON_SECRET: 'test-secret' } })
  assert.equal((await disabled(request())).status, 401)
  assert.equal((await disabled(request('Bearer test-secret'))).status, 503)
  const calls = [],
    sent = []
  const get = await route(path, {
    env: {
      CRON_SECRET: 'test-secret',
      RESEND_API_KEY: 'test-key',
      NOTIFICATION_EMAIL_FROM: 'CyberPurview <test@example.test>',
      APP_URL: 'https://app.example.test',
    },
    client: {
      rpc: async (name, args) => {
        calls.push([name, args])
        return {
          data:
            name === 'claim_notification_emails'
              ? [
                  {
                    id: uid,
                    email: 'member@example.test',
                    title: 'Course ready',
                    message: 'Start learning',
                    href: '/learner',
                  },
                ]
              : null,
        }
      },
    },
    fetch: async (url, options) => {
      sent.push([url, options])
      return { ok: true }
    },
  })
  assert.equal((await get(request('Bearer test-secret'))).status, 200)
  assert.equal(sent[0][1].headers['Idempotency-Key'], `notification/${uid}`)
  assert.ok(JSON.parse(sent[0][1].body).text.includes('https://app.example.test/learner'))
  assert.equal(calls[1][1].delivered, true)
})
