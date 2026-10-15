import { test } from 'node:test'
import assert from 'node:assert/strict'
import vm from 'node:vm'
import { readFile } from 'node:fs/promises'
import ts from 'typescript'
import { z } from 'zod'

async function setup(rows = []) {
  const calls = []
  const query = new Proxy(
    {},
    {
      get(_, name) {
        if (name === 'then') return (resolve) => resolve({ data: rows, error: null })
        return (...args) => {
          calls.push([name, ...args])
          return query
        }
      },
    },
  )
  const exports = {}
  vm.runInNewContext(
    ts.transpileModule(await readFile('src/lib/server/public-catalog.ts', 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText,
    {
      exports,
      Error,
      require(name) {
        if (name === 'server-only') return {}
        if (name === 'zod') return { z }
        if (name === '@/lib/lms/course-browse') return { COURSE_BATCH_SIZE: 12 }
        if (name === '@/lib/supabase/config')
          return {
            supabaseConfig: () => ({ url: 'https://example.supabase.co', key: 'publishable-key' }),
          }
        if (name === '@supabase/supabase-js')
          return {
            createClient: (...args) => {
              calls.push(['client', ...args])
              return query
            },
          }
        throw new Error(name)
      },
    },
  )
  return { exports, calls }
}

test('public catalog uses anonymous credentials, indexed filters, and a bounded cursor page', async () => {
  const rows = Array.from({ length: 13 }, (_, i) => ({ id: String(i), title: 'Course' }))
  const { exports, calls } = await setup(rows)
  const cursor = '1198928a-a207-444e-b47e-9aa8a53e4480'
  const result = await exports.publicCoursePage({
    q: 'cloud security',
    category: 'Cybersecurity',
    level: 'Beginner',
    cursor,
  })
  assert.equal(result.courses.length, 12)
  assert.equal(result.nextCursor, '11')
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'status' && c[2] === 'published'))
  assert.ok(calls.some((c) => c[0] === 'limit' && c[1] === 13))
  assert.ok(calls.some((c) => c[0] === 'gt' && c[1] === 'id' && c[2] === cursor))
  assert.ok(
    calls.some(
      (c) => c[0] === 'textSearch' && c[1] === 'search_document' && c[2] === 'cloud security',
    ),
  )
  const client = calls.find((c) => c[0] === 'client')
  assert.equal(client[2], 'publishable-key')
  assert.equal(client[3].auth.persistSession, false)
  assert.ok(!calls.some((c) => c[0] === 'rpc' || (c[0] === 'from' && c[1] !== 'courses')))
  const columns = calls.find((c) => c[0] === 'select')[1]
  assert.ok(!columns.includes('*') && !columns.includes('tutor_id'))
})

test('invalid public filters and course slugs are rejected before database access', async () => {
  const { exports, calls } = await setup()
  await assert.rejects(exports.publicCoursePage({ q: 'x'.repeat(201) }))
  await assert.rejects(exports.publicCoursePage({ cursor: 'bad-cursor' }))
  assert.equal(await exports.publicCourse('../private'), null)
  assert.equal(calls.length, 0)
})

test('public previews require published status and exact slug lookups', async () => {
  const { exports, calls } = await setup(null)
  assert.equal(await exports.publicCourse('cloud-security'), null)
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'status' && c[2] === 'published'))
  assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === 'slug' && c[2] === 'cloud-security'))
})
