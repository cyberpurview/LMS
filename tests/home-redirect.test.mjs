import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import assert from 'node:assert/strict'
import { test } from 'node:test'

const require = createRequire(import.meta.url)
const source = ts.transpileModule(
  await readFile(new URL('../src/app/page.tsx', import.meta.url), 'utf8'),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX } },
).outputText

function home(identity, failure = false) {
  const exports = {}
  const LandingPage = () => null
  vm.runInNewContext(source, {
    exports,
    require: (name) => {
      if (name === '@/lib/server/auth')
        return {
          getIdentity: async () => {
            if (failure) throw new Error('Auth unavailable')
            return identity
          },
        }
      if (name === 'next/navigation')
        return {
          redirect: (path) => {
            throw new Error(`redirect:${path}`)
          },
        }
      if (name === '@/components/marketing/LandingPage') return { LandingPage }
      return require(name)
    },
  })
  return { render: exports.default, LandingPage, dynamic: exports.dynamic }
}

test('homepage redirects verified users to their own role dashboard', async () => {
  for (const role of ['learner', 'tutor', 'admin']) {
    const page = home({ user: { role } })
    assert.equal(page.dynamic, 'force-dynamic')
    await assert.rejects(page.render(), new RegExp(`redirect:/${role}$`))
  }
})

test('homepage keeps the landing page available for visitors and temporary auth failures', async () => {
  for (const failure of [false, true]) {
    const page = home(null, failure)
    assert.equal((await page.render()).type, page.LandingPage)
  }
})
