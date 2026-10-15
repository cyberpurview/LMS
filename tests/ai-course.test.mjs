import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'
import { requestBody } from './helpers/request-body.mjs'
const require = createRequire(import.meta.url),
  { NextRequest } = require('next/server')
const compile = (s) =>
  ts.transpileModule(s, {
    fileName: 'module.ts',
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
const schemas = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/ai-course.ts', import.meta.url), 'utf8')),
  { exports: schemas, require },
)
const outline = {
  description: 'A useful course',
  objectives: ['Learn safe practice'],
  modules: [{ title: 'Fundamentals', lessons: ['Introduction'] }],
}
const spec = {
  title: 'Security basics',
  audience: 'Beginners',
  goals: 'Understand risks',
  level: 'Beginner',
  category: 'Cybersecurity',
  tutorId: randomUUID(),
  moduleCount: 1,
  lessonsPerModule: 1,
}
const routeSource = compile(
  await readFile(new URL('../src/app/api/ai-courses/route.ts', import.meta.url), 'utf8'),
)
test('AI API enforces staff identity, same origin, payload limits and validated outline approval', async () => {
  let role = 'learner'
  let signedIn = true
  const calls = [],
    exports = {}
  vm.runInNewContext(routeSource, {
    exports,
    process: { env: { GROQ_API_KEY: 'server-only-test-key', GROQ_MODEL: 'test-model' } },
    require: (name) => {
      if (name === '@/lib/server/auth')
        return {
          getIdentity: async () =>
            signedIn
              ? {
                  user: { role },
                  client: {
                    rpc: async (name, args) => {
                      calls.push([name, args])
                      return { data: [], error: null }
                    },
                  },
                }
              : null,
        }
      if (name === '@/lib/lms/ai-course') return schemas
      if (name === '@/lib/server/request-body') return requestBody
      return require(name)
    },
  })
  const request = (body, origin = 'http://localhost:3000') =>
    new NextRequest('http://localhost:3000/api/ai-courses', {
      method: 'POST',
      headers: { origin, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  assert.equal((await exports.GET()).status, 403)
  signedIn = false
  assert.equal((await exports.GET()).status, 401)
  assert.equal(
    (await exports.POST(request({ action: 'create', id: randomUUID(), spec }))).status,
    401,
  )
  signedIn = true
  assert.equal(
    (await exports.POST(request({ action: 'create', id: randomUUID(), spec }))).status,
    403,
  )
  role = 'tutor'
  assert.equal(
    (
      await exports.POST(
        request({ action: 'create', id: randomUUID(), spec }, 'https://attacker.test'),
      )
    ).status,
    403,
  )
  assert.equal(
    (
      await exports.POST(
        request({ action: 'create', id: randomUUID(), spec: { ...spec, moduleCount: 100 } }),
      )
    ).status,
    400,
  )
  assert.equal(
    (
      await exports.POST(
        request({ action: 'approve', id: randomUUID(), outline: { ...outline, modules: [] } }),
      )
    ).status,
    400,
  )
  assert.equal(calls.length, 0)
  assert.equal((await exports.POST(request({ padding: 'x'.repeat(51000) }))).status, 413)
  const response = await exports.POST(
    request({ action: 'create', id: randomUUID(), spec, apiKey: 'never forwarded' }),
  )
  assert.equal(response.status, 200)
  assert.equal('apiKey' in calls[0][1].payload, false)
  const status = await exports.GET()
  assert.equal(status.headers.get('cache-control'), 'private, no-store')
  assert.equal(JSON.stringify(await status.json()).includes('server-only-test-key'), false)
})

const providerSource = compile(
  await readFile(new URL('../src/lib/server/ai-provider.ts', import.meta.url), 'utf8'),
)

test('AI worker requires its secret, saves leased results and records provider failures safely', async () => {
  const exports = {},
    calls = [],
    env = {
      CRON_SECRET: 'worker-test-secret',
      GROQ_API_KEY: 'private-test-key',
      GROQ_MODEL: 'test-model',
    }
  let job = null,
    fail = false
  class ProviderError extends Error {
    permanent = true
  }
  vm.runInNewContext(
    compile(
      await readFile(new URL('../src/app/api/cron/ai-courses/route.ts', import.meta.url), 'utf8'),
    ),
    {
      exports,
      Buffer,
      process: { env },
      require: (name) => {
        if (name === '@/lib/server/storage')
          return {
            storageAdmin: () => ({
              rpc: async (name, args) => {
                calls.push({ name, args })
                return { data: name === 'claim_ai_course_work' ? job : null, error: null }
              },
            }),
          }
        if (name === '@/lib/server/ai-provider')
          return {
            AiProviderError: ProviderError,
            generateAiOutline: async () => {
              if (fail) throw new ProviderError('Provider access denied')
              return outline
            },
            generateAiLesson: async () => 'Safe lesson',
          }
        return require(name)
      },
    },
  )
  const request = (secret) =>
    new NextRequest('http://localhost:3000/api/cron/ai-courses', {
      headers: { authorization: `Bearer ${secret}` },
    })
  assert.equal((await exports.GET(request('wrong'))).status, 401)
  assert.equal(calls.length, 0)
  assert.equal((await (await exports.GET(request(env.CRON_SECRET))).json()).processed, 0)
  job = {
    id: randomUUID(),
    lease_token: randomUUID(),
    model: 'pinned-model',
    spec,
    course_id: null,
  }
  await exports.GET(request(env.CRON_SECRET))
  let finish = calls.at(-1)
  assert.equal(finish.name, 'finish_ai_course_work')
  assert.equal(finish.args.lease, job.lease_token)
  assert.equal(finish.args.result.modules[0].title, 'Fundamentals')
  fail = true
  const response = await exports.GET(request(env.CRON_SECRET))
  finish = calls.at(-1)
  assert.equal(finish.args.permanent, true)
  assert.equal(finish.args.result, null)
  assert.equal(finish.args.error_message, 'Provider access denied')
  assert.equal(JSON.stringify(await response.json()).includes(env.GROQ_API_KEY), false)
})
function provider(reply, status = 200) {
  const exports = {},
    calls = []
  vm.runInNewContext(providerSource, {
    exports,
    Buffer,
    AbortSignal,
    process: { env: { GROQ_API_KEY: 'private-test-key' } },
    fetch: async (url, options) => {
      calls.push({ url, options })
      return new Response(JSON.stringify(reply), { status })
    },
    require: (name) => {
      if (name === 'server-only') return {}
      if (name === '@/lib/lms/ai-course') return schemas
      if (name === '@/lib/server/request-body') return requestBody
      if (name === '@/lib/lms/rich-text')
        return {
          RICH_TEXT_PREFIX: '<!--rich-->',
          sanitizeLessonHtml: (html) => require('sanitize-html')(html),
        }
      return require(name)
    },
  })
  return { ...exports, calls }
}
const candidate = (value) => ({
  choices: [{ finish_reason: 'stop', message: { content: JSON.stringify(value) } }],
})
test('Groq uses private Bearer headers and strict schemas, validates outlines and sanitizes lessons', async () => {
  const ai = provider(candidate(outline))
  assert.equal((await ai.generateAiOutline('openai/gpt-oss-120b', spec)).modules.length, 1)
  assert.equal(ai.calls[0].url.includes('private-test-key'), false)
  assert.equal(ai.calls[0].options.headers.Authorization, 'Bearer private-test-key')
  assert.equal(JSON.parse(ai.calls[0].options.body).response_format.type, 'json_schema')
  const body = JSON.parse(ai.calls[0].options.body)
  assert.equal(body.model, 'openai/gpt-oss-120b')
  assert.equal(body.response_format.json_schema.strict, true)
  assert.equal(body.response_format.json_schema.schema.additionalProperties, false)
  const invalid = provider(
    candidate({ ...outline, modules: [...outline.modules, ...outline.modules] }),
  )
  await assert.rejects(invalid.generateAiOutline('test-model', spec), /requested structure/)
  const html =
    '<h2>Lesson</h2><script>alert(1)</script><p>' + 'Practical safe example. '.repeat(30) + '</p>'
  const lesson = await provider(candidate({ html })).generateAiLesson('test-model', spec, outline, {
    title: 'Introduction',
    moduleTitle: 'Fundamentals',
  })
  assert.ok(lesson.startsWith('<!--rich-->'))
  assert.equal(lesson.includes('<script'), false)
})
test('provider quotas, blocked projects and truncated content produce bounded actionable failures', async () => {
  await assert.rejects(provider({}, 429).generateAiOutline('test-model', spec), /usage limit/)
  await assert.rejects(
    provider(
      { error: { message: 'Your project has been denied access. Please contact support.' } },
      403,
    ).generateAiOutline('test-model', spec),
    (e) => e.permanent && /Groq rejected/.test(e.message),
  )
  await assert.rejects(
    provider({ choices: [{ finish_reason: 'length' }] }).generateAiOutline('test-model', spec),
    /could not complete/,
  )
  await assert.rejects(
    provider(candidate({ html: 'x'.repeat(210000) })).generateAiLesson(
      'test-model',
      spec,
      outline,
      { title: 'Introduction', moduleTitle: 'Fundamentals' },
    ),
    /too large/,
  )
})
