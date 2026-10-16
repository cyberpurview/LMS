import assert from 'node:assert/strict'
import { test, after } from 'node:test'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import ts from 'typescript'
import { PGlite } from '@electric-sql/pglite'
import { requestBody } from './helpers/request-body.mjs'

const require = createRequire(import.meta.url)
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
const contact = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/contact.ts', import.meta.url), 'utf8')),
  { exports: contact, require },
)
const valid = () => ({
  name: 'Contact Test',
  email: 'person@example.test',
  subject: 'Account help',
  message: 'Please help me access my learning account.',
  startedAt: Date.now() - 5000,
  website: '',
  requestId: randomUUID(),
})
async function routeFixture({ quota = 'allowed', providerOK = true, finishError = false } = {}) {
  const calls = [],
    exports = {}
  vm.runInNewContext(
    compile(await readFile(new URL('../src/app/api/contact/route.ts', import.meta.url), 'utf8')),
    {
      exports,
      Date,
      URL,
      JSON,
      Buffer,
      AbortSignal,
      process: {
        env: {
          VERCEL: '1',
          RESEND_API_KEY: 'test-secret',
          NOTIFICATION_EMAIL_FROM: 'Sender <sender@example.test>',
          CONTACT_EMAIL_TO: 'owner@example.test',
          CRON_SECRET: 'test-salt',
        },
      },
      require: (name) =>
        name === 'next/server'
          ? {
              NextResponse: {
                json: (body, options = {}) => new Response(JSON.stringify(body), options),
              },
            }
          : name === '@/lib/lms/contact'
            ? contact
            : name === '@/lib/server/request-body'
              ? requestBody
              : name === '@/lib/server/storage'
                ? {
                    storageAdmin: () => ({
                      rpc: async (name, args) => {
                        calls.push({ name, args })
                        return name === 'claim_contact_message'
                          ? { data: quota, error: null }
                          : { error: finishError ? { message: 'database unavailable' } : null }
                      },
                    }),
                  }
                : require(name),
      fetch: async (url, options) => {
        calls.push({ url, options })
        return new Response('{}', { status: providerOK ? 200 : 503 })
      },
    },
  )
  const post = async (data = valid(), origin = 'https://example.test') => {
    const request = new Request('https://example.test/api/contact', {
      method: 'POST',
      headers: {
        origin,
        host: 'example.test',
        'content-type': 'application/json',
        'x-forwarded-for': '192.0.2.1',
      },
      body: JSON.stringify(data),
    })
    request.nextUrl = new URL(request.url)
    return exports.POST(request)
  }
  return { post, calls }
}
test('contact validation rejects header injection and oversized messages', () => {
  assert.equal(
    contact.contactSchema.safeParse({ ...valid(), name: 'Person\nBcc: other@example.test' })
      .success,
    false,
  )
  assert.equal(
    contact.contactSchema.safeParse({ ...valid(), message: 'x'.repeat(5001) }).success,
    false,
  )
  assert.equal(
    contact.contactSchema.safeParse({
      ...valid(),
      email: 'person@example.test\r\nBcc: other@example.test',
    }).success,
    false,
  )
})
test('contact rejects cross-origin requests and discards honeypot submissions before email', async () => {
  const f = await routeFixture()
  assert.equal((await f.post(valid(), 'https://other.test')).status, 403)
  assert.equal((await f.post({ ...valid(), website: 'spam' })).status, 200)
  assert.equal(f.calls.length, 0)
})
test('contact sends only to configured inbox, uses reply-to, then acknowledges delivery', async () => {
  const f = await routeFixture(),
    data = valid()
  assert.equal((await f.post(data)).status, 200)
  const sent = f.calls.find((c) => c.url)
  const body = JSON.parse(sent.options.body)
  assert.deepEqual(body.to, ['owner@example.test'])
  assert.equal(body.reply_to, data.email)
  assert.equal(body.from, 'Sender <sender@example.test>')
  assert.equal(sent.options.headers['Idempotency-Key'], `contact/${data.requestId}`)
  assert.equal(f.calls.at(-1).name, 'finish_contact_message')
  assert.match(f.calls[0].args.ip_hash, /^[a-f0-9]{64}$/)
  assert.ok(!JSON.stringify(f.calls[0]).includes('192.0.2.1'))
})
test('contact provider failures never report success, and delivered retries do not resend', async () => {
  const failed = await routeFixture({ providerOK: false })
  assert.equal((await failed.post()).status, 503)
  assert.equal(
    failed.calls.some((c) => c.name === 'finish_contact_message'),
    false,
  )
  const replay = await routeFixture({ quota: 'sent' })
  assert.equal((await replay.post()).status, 200)
  assert.equal(
    replay.calls.some((c) => c.url),
    false,
  )
  const waiting = await routeFixture({ quota: 'wait' })
  assert.equal((await waiting.post()).status, 429)
  assert.equal(
    waiting.calls.some((c) => c.url),
    false,
  )
})

const db = new PGlite()
await db.exec(
  'create schema lms_private; create role anon; create role authenticated; create role service_role;',
)
await db.exec(
  await readFile(
    new URL('../supabase/migrations/20261016010000_contact_messages.sql', import.meta.url),
    'utf8',
  ),
)
after(() => db.close())
const h = (n) => n.toString(16).padStart(64, '0')
const claim = async (id, ip, email, payload = h(999)) =>
  (
    await db.query('select public.claim_contact_message($1,$2,$3,$4) as result', [
      id,
      ip,
      email,
      payload,
    ])
  ).rows[0].result
test('contact quota is service-only, private and idempotent with bounded retries', async () => {
  await db.exec('set role anon')
  await assert.rejects(claim(randomUUID(), h(1), h(1)), /permission denied/)
  await assert.rejects(
    db.query('select * from lms_private.contact_message_requests'),
    /permission denied/,
  )
  await db.exec('reset role; set role service_role')
  const id = randomUUID()
  assert.equal(await claim(id, h(1), h(1)), 'allowed')
  assert.equal(await claim(id, h(1), h(1)), 'wait')
  assert.equal(await claim(id, h(1), h(2)), 'conflict')
  await db.exec('reset role')
  await db.query(
    "update lms_private.contact_message_requests set last_attempt_at=now()-interval '20 seconds' where id=$1",
    [id],
  )
  assert.equal(await claim(id, h(1), h(1)), 'allowed')
  await db.query('select public.finish_contact_message($1,$2)', [id, h(999)])
  assert.equal(await claim(id, h(1), h(1)), 'sent')
})
test('contact limits apply independently to IP, email and the whole platform', async () => {
  await db.exec('truncate lms_private.contact_message_requests')
  for (let i = 0; i < 3; i++) assert.equal(await claim(randomUUID(), h(10), h(20 + i)), 'allowed')
  assert.equal(await claim(randomUUID(), h(10), h(50)), 'limited')
  for (let i = 0; i < 3; i++) assert.equal(await claim(randomUUID(), h(60 + i), h(70)), 'allowed')
  assert.equal(await claim(randomUUID(), h(99), h(70)), 'limited')
  for (let i = 6; i < 100; i++)
    assert.equal(await claim(randomUUID(), h(1000 + i), h(2000 + i)), 'allowed')
  assert.equal(await claim(randomUUID(), h(9999), h(9999)), 'limited')
})
