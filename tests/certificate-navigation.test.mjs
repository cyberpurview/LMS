import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import vm from 'node:vm'
import ts from 'typescript'

const subjectId = '1198928a-a207-444e-b47e-9aa8a53e4480'
async function setup(data) {
  const calls = [],
    exports = {}
  const query = new Proxy(
    {},
    {
      get(_, name) {
        if (name === 'then') return (resolve) => resolve({ data, error: null })
        return (...args) => {
          calls.push([name, ...args])
          return query
        }
      },
    },
  )
  vm.runInNewContext(
    ts.transpileModule(
      await readFile('src/app/learner/certificates/[kind]/[subjectId]/page.tsx', 'utf8'),
      {
        compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      },
    ).outputText,
    {
      exports,
      Error,
      require(name) {
        if (name === 'next/navigation')
          return {
            notFound() {
              throw new Error('not-found')
            },
            redirect(url) {
              throw new Error(url)
            },
          }
        if (name === '@/lib/server/auth')
          return {
            requireRole: async (role) => {
              calls.push(['role', role])
              return { user: { id: 'current-learner' }, client: query }
            },
          }
        if (name === '@/lib/lms/course-url')
          return { COURSE_UUID: /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i }
        throw new Error(name)
      },
    },
  )
  return {
    open: (kind, id = subjectId) =>
      exports.default({ params: Promise.resolve({ kind, subjectId: id }) }),
    calls,
  }
}
test('course and standalone quiz certificate links resolve only the signed-in learner’s exact award', async () => {
  for (const kind of ['course', 'quiz']) {
    const { open, calls } = await setup({ id: 'specific-certificate' })
    await assert.rejects(open(kind), /\/certificates\/specific-certificate/)
    assert.ok(calls.some((c) => c[0] === 'role' && c[1] === 'learner'))
    assert.ok(
      calls.some((c) => c[0] === 'eq' && c[1] === 'learner_id' && c[2] === 'current-learner'),
    )
    assert.ok(calls.some((c) => c[0] === 'eq' && c[1] === `${kind}_id` && c[2] === subjectId))
  }
})
test('missing awards and malformed certificate subjects cannot redirect to unrelated certificates', async () => {
  const { open, calls } = await setup(null)
  await assert.rejects(open('course', 'invalid'), /not-found/)
  await assert.rejects(open('admin'), /not-found/)
  assert.equal(calls.length, 0)
  await assert.rejects(open('course'), /not-found/)
})
