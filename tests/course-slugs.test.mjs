import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { PGlite } from '@electric-sql/pglite'
import { courseUrlExports } from './helpers/course-url.mjs'
const require = createRequire(import.meta.url)
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
  }).outputText
const cid = '1198928a-a207-444e-b47e-9aa8a53e4480'

test('slug migration backfills existing courses without changing IDs or revisions', async () => {
  const db = new PGlite()
  try {
    await db.exec(`create role anon;create role authenticated;create schema lms_private;
    create table public.courses(id uuid primary key,title text,updated_at timestamptz not null);
    create function public.browse_courses(mode text,after_id uuid,page_size integer,search text,category_filter text,level_filter text,state_filter text) returns jsonb language sql as $$select jsonb_build_object('id',c.id,'title',c.title) from public.courses c limit 1$$;`)
    await db.query(
      "insert into courses values($1,'Existing Course','2026-10-15T10:00:00.123456Z')",
      [cid],
    )
    const before = (await db.query('select updated_at::text as revision from courses')).rows[0]
      .revision
    await db.exec(
      await readFile(
        new URL('../supabase/migrations/20261015120000_course_slugs.sql', import.meta.url),
        'utf8',
      ),
    )
    const row = (await db.query('select id,slug,updated_at::text as revision from courses')).rows[0]
    assert.equal(row.id, cid)
    assert.equal(row.slug, 'existing-course')
    assert.equal(row.revision, before)
    await db.query("update courses set title='New Name',slug='replace-url' where id=$1", [cid])
    assert.equal((await db.query('select slug from courses')).rows[0].slug, 'existing-course')
  } finally {
    await db.close()
  }
})

test('legacy course redirects use RLS lookups and preserve learning routes', async () => {
  const exports = {},
    calls = []
  let visible = true
  vm.runInNewContext(
    compile(
      await readFile(new URL('../src/lib/server/legacy-course-url.ts', import.meta.url), 'utf8'),
    ),
    {
      exports,
      Error,
      require: (name) =>
        name === 'server-only'
          ? {}
          : name === '@/lib/lms/course-url'
            ? courseUrlExports
            : name === 'next/navigation'
              ? {
                  redirect: (path) => {
                    throw Object.assign(new Error('redirect'), { path })
                  },
                }
              : name === '@/lib/supabase/server'
                ? {
                    createClient: async () => ({
                      from: (table) => ({
                        select: (columns) => ({
                          eq: (key, value) => ({
                            maybeSingle: async () => {
                              calls.push({ table, columns, key, value })
                              return {
                                data: visible
                                  ? { id: cid, slug: 'cybersecurity-fundamentals' }
                                  : null,
                                error: null,
                              }
                            },
                          }),
                        }),
                      }),
                    }),
                  }
                : require(name),
    },
  )
  await assert.rejects(
    exports.redirectLegacyCourse(cid, '/learn'),
    (error) => error.path === '/learner/courses/cybersecurity-fundamentals/learn',
  )
  assert.deepEqual(calls[0], { table: 'courses', columns: 'id,slug', key: 'id', value: cid })
  visible = false
  await exports.redirectLegacyCourse(cid)
  const count = calls.length
  await exports.redirectLegacyCourse('cybersecurity-fundamentals')
  await exports.redirectLegacyCourse("anything');drop-table")
  assert.equal(calls.length, count)
})

test('workspace resolves slugs once and scopes course queries to UUIDs; missing slugs stop early', async () => {
  const stateExports = {}
  vm.runInNewContext(
    compile(await readFile(new URL('../src/lib/lms/state.ts', import.meta.url), 'utf8')),
    { exports: stateExports, require: () => ({ BRAND_NAME: 'CyberPurview' }) },
  )
  const exports = {},
    calls = []
  let visible = true
  const course = {
    id: cid,
    slug: 'cybersecurity-fundamentals',
    title: 'Cybersecurity',
    tutor_id: 'tutor',
    tags: [],
    price: 0,
    duration: 1,
    status: 'published',
  }
  const client = {
    from(table) {
      const call = { table, filters: [], single: false, columns: '' }
      calls.push(call)
      return {
        select(columns) {
          call.columns = columns
          return this
        },
        eq(key, value) {
          call.filters.push([key, value])
          return this
        },
        order() {
          return this
        },
        range() {
          return this
        },
        limit() {
          return this
        },
        in() {
          return this
        },
        single() {
          call.single = true
          return this
        },
        maybeSingle() {
          call.single = true
          return this
        },
        then(resolve) {
          return Promise.resolve({
            data:
              table === 'courses'
                ? call.single
                  ? visible
                    ? { id: cid }
                    : null
                  : [course]
                : call.single
                  ? { platform_name: 'CyberPurview' }
                  : [],
            error: null,
            count: 0,
          }).then(resolve)
        },
      }
    },
    async rpc() {
      return { data: [], error: null }
    },
  }
  vm.runInNewContext(
    compile(await readFile(new URL('../src/lib/server/workspace.ts', import.meta.url), 'utf8')),
    {
      exports,
      structuredClone,
      Error,
      require: (name) =>
        name === 'server-only'
          ? {}
          : name === '@/lib/lms/state'
            ? stateExports
            : name === '@/lib/supabase/config'
              ? { supabaseConfig: () => ({ url: 'https://example.test' }) }
              : name === '@/lib/lms/thumbnail'
                ? { THUMBNAIL_BUCKET: 'course-thumbnails' }
                : require(name),
    },
  )
  const user = { id: 'learner', role: 'learner' }
  const reply = await exports.loadWorkspace(
    client,
    user,
    0,
    '/learner/courses/cybersecurity-fundamentals',
  )
  assert.equal(reply.state.courses[0].id, cid)
  assert.equal(reply.state.courses[0].slug, course.slug)
  assert.equal(calls.filter((c) => c.filters.some(([key]) => key === 'slug')).length, 1)
  for (const call of calls.filter((c) => ['enrollments', 'quizzes'].includes(c.table)))
    assert.ok(call.filters.some(([key, value]) => key === 'course_id' && value === cid))
  calls.length = 0
  visible = false
  const missing = await exports.loadWorkspace(
    client,
    user,
    0,
    '/learner/courses/inaccessible-course',
  )
  assert.equal(missing.state.courses.length, 0)
  assert.equal(calls.length, 1)
  await assert.rejects(
    exports.loadWorkspace(client, user, 0, '/learner/courses/' + 'a'.repeat(97)),
    /Invalid course URL/,
  )
  assert.equal(calls.length, 1)
})
