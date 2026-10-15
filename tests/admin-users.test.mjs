import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
import { richText } from './helpers/rich-text.mjs'
import { requestBody } from './helpers/request-body.mjs'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
function compile(source) {
  return ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
}
const schemaExports = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/commands.ts', import.meta.url), 'utf8')),
  { exports: schemaExports, require },
)
const route = compile(
  await readFile(new URL('../src/app/api/commands/route.ts', import.meta.url), 'utf8'),
)
const createdId = '11111111-1111-4111-8111-111111111111'
const token = 'a'.repeat(64)
test('profile API rejects email changes before issuing an authentication update or profile mutation', async () => {
  const app = setup({ role: 'learner' })
  const profileRequest = (email) =>
    new NextRequest('http://localhost:3000/api/commands', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'profile',
        user: { id: createdId, name: 'Learner', email, role: 'learner', isActive: true },
      }),
    })
  const response = await app.post(profileRequest('changed@example.test'))
  assert.equal(response.status, 403)
  assert.equal((await response.json()).error, 'Your sign-in email cannot be changed.')
  assert.equal(app.events.length, 0)
  const unchanged = await app.post(profileRequest('existing@example.test'))
  assert.equal(unchanged.status, 200)
  assert.equal(app.events.length, 1)
})
function setup({
  role = 'admin',
  existing = null,
  assignmentError = null,
  providerError = null,
  thumbnailError = null,
} = {}) {
  const events = []
  const client = {
    from: () => ({
      select: () => ({
        eq: (_field, email) => ({
          single: async () => ({ data: { email: 'existing@example.test' }, error: null }),
          maybeSingle: async () => {
            events.push(['lookup', email])
            return { data: existing, error: null }
          },
        }),
      }),
    }),
    rpc: async (_name, args) => {
      events.push(['assign', args])
      return { data: null, error: assignmentError }
    },
  }
  const exports = {}
  vm.runInNewContext(route, {
    exports,
    URL,
    process: { env: { SUPABASE_SECRET_KEY: 'server-test-key' } },
    require: (name) => {
      if (name === '@/lib/server/course-resource-cleanup')
        return { cleanupCourseResources: async () => 0 }
      if (name === '@/lib/server/request-body') return requestBody
      if (name === '@/lib/lms/rich-text') return richText
      if (name === '@/lib/server/auth')
        return { getIdentity: async () => (role ? { user: { role, id: 'admin' }, client } : null) }
      if (name === '@/lib/lms/commands') return schemaExports
      if (name === '@/lib/server/storage')
        return {
          storageAdmin: () => ({
            storage: {
              from: () => ({
                info: async (path) => {
                  events.push(['image', path])
                  return { data: thumbnailError ? null : { name: path }, error: thumbnailError }
                },
              }),
            },
          }),
        }
      if (name === '@/lib/lms/thumbnail') return { THUMBNAIL_BUCKET: 'course-thumbnails' }
      if (name === '@/lib/supabase/config')
        return { supabaseConfig: () => ({ url: 'https://test.supabase.co' }) }
      if (name === '@supabase/supabase-js')
        return {
          createClient: () => ({
            auth: {
              admin: {
                generateLink: async (params) => {
                  events.push(['generate', params])
                  return {
                    data: { user: { id: createdId }, properties: { hashed_token: token } },
                    error: providerError,
                  }
                },
              },
            },
          }),
        }
      return require(name)
    },
  })
  return { post: exports.POST, events }
}
function request(role = 'tutor', origin = 'http://localhost:3000') {
  return new NextRequest('http://localhost:3000/api/commands', {
    method: 'POST',
    headers: { origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'invite',
      name: 'Test Member',
      email: 'Member@example.test',
      role,
    }),
  })
}

test('only administrators can create categories through the API', async () => {
  for (const role of [null, 'learner', 'tutor', 'admin']) {
    const { post, events } = setup({ role })
    const response = await post(
      new NextRequest('http://localhost:3000/api/commands', {
        method: 'POST',
        headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: 'category', name: 'Incident Response' }),
      }),
    )
    assert.equal(response.status, role === 'admin' ? 200 : role ? 403 : 401)
    assert.equal(events.length, role === 'admin' ? 1 : 0)
    if (role === 'admin') assert.equal(events[0][1].command, 'category')
  }
})
test('anonymous users, learners and tutors cannot add accounts', async () => {
  for (const role of [null, 'learner', 'tutor']) {
    const { post, events } = setup({ role })
    assert.equal((await post(request())).status, role ? 403 : 401)
    assert.equal(events.length, 0)
  }
})
test('Add user rejects an admin role and cross-origin requests', async () => {
  const { post, events } = setup()
  assert.equal((await post(request('admin'))).status, 400)
  assert.equal((await post(request('tutor', 'https://other.example'))).status, 403)
  assert.equal(events.length, 0)
})
test('admins create tutors and learners without sending email or returning server credentials', async () => {
  for (const role of ['tutor', 'learner']) {
    const { post, events } = setup()
    const response = await post(request(role))
    assert.equal(response.status, 200)
    assert.equal(events[1][1].type, 'invite')
    assert.equal(events[1][1].email, 'member@example.test')
    assert.equal(events[2][1].payload.role, role)
    assert.equal(events[2][1].payload.id, createdId)
    const reply = await response.json()
    const link = new URL(reply.data.activationLink)
    assert.equal(link.origin, 'http://localhost:3000')
    assert.equal(link.pathname, '/auth/confirm')
    assert.equal(link.searchParams.get('type'), 'invite')
    assert.equal(link.searchParams.get('token_hash'), token)
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
    assert.doesNotMatch(JSON.stringify(reply), /server-test-key/)
  }
})
test('existing accounts cannot be replaced or have their role changed by Add user', async () => {
  const { post, events } = setup({ existing: { id: createdId } })
  assert.equal((await post(request())).status, 409)
  assert.equal(events.length, 1)
})
test('a setup link is withheld if role assignment fails', async () => {
  const { post } = setup({ assignmentError: { message: 'Database unavailable' } })
  const response = await post(request())
  assert.equal(response.status, 400)
  const reply = await response.json()
  assert.equal(reply.data, undefined)
  assert.match(reply.error, /role could not be saved/)
})

test('command API rejects oversized bodies without Content-Length before executing database commands', async () => {
  const api = setup({ role: 'tutor' })
  const response = await api.post(
    new NextRequest('http://localhost:3000/api/commands', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'saveCourse', course: { description: '😀'.repeat(140000) } }),
    }),
  )
  assert.equal(response.status, 413)
  assert.equal(api.events.length, 0)
})

test('course saves accept only existing uploaded images for the same course', async () => {
  const imagePath = `${createdId}/${createdId}/${createdId}.webp`
  const course = {
    id: createdId,
    tutorId: createdId,
    title: 'Draft',
    description: '',
    category: 'Cybersecurity',
    level: 'Beginner',
    status: 'draft',
    price: 0,
    duration: 1,
    thumbnail: `https://test.supabase.co/storage/v1/object/public/course-thumbnails/${imagePath}`,
    tags: [],
    updatedAt: '2026-10-11T01:00:00.123456+00:00',
    modules: [],
  }
  const save = (c) =>
    new NextRequest('http://localhost:3000/api/commands', {
      method: 'POST',
      headers: { origin: 'http://localhost:3000', 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'saveCourse', course: c }),
    })
  const valid = setup({ role: 'tutor' })
  assert.equal((await valid.post(save(course))).status, 200)
  assert.equal(valid.events[0][1], imagePath)
  assert.equal(valid.events[1][1].payload.thumbnail, course.thumbnail)
  for (const thumbnail of [
    'https://other.example/picture.jpg',
    course.thumbnail.replace(
      `/${createdId}/${createdId}/`,
      `/${createdId}/33333333-3333-4333-8333-333333333333/`,
    ),
  ]) {
    const invalid = setup()
    assert.equal((await invalid.post(save({ ...course, thumbnail }))).status, 400)
    assert.equal(invalid.events.length, 0)
  }
  const missing = setup({ thumbnailError: new Error('Not found') })
  assert.equal((await missing.post(save(course))).status, 400)
  assert.equal(
    missing.events.some((e) => e[0] === 'assign'),
    false,
  )
  const learner = setup({ role: 'learner' })
  assert.equal((await learner.post(save(course))).status, 403)
  assert.equal(learner.events.length, 0)
})
