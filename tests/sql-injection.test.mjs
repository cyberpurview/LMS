import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
import { createClient } from '@supabase/supabase-js'

const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const source = await readFile(new URL('../src/app/api/courses/route.ts', import.meta.url), 'utf8')
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
}).outputText

function setup() {
  const requests = []
  const client = createClient('https://example.supabase.co', 'public-test-key', {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: async (url) => {
        requests.push(new URL(url))
        return new Response('[]', { headers: { 'Content-Type': 'application/json' } })
      },
    },
  })
  const exports = {}
  vm.runInNewContext(compiled, {
    exports,
    require: (name) =>
      name === '@/lib/supabase/server' ? { createClient: async () => client } : require(name),
  })
  return { ...exports, requests }
}

test('catalog SQL and PostgREST injection strings remain filter values with fixed columns and ordering', async () => {
  const { GET, requests } = setup()
  const attack = "x'); DROP TABLE public.courses; --"
  const filterAttack = 'Cybersecurity,status.eq.draft),or=(id.not.is.null'
  const url = new URL('http://localhost:3000/api/courses')
  url.searchParams.set('q', attack)
  url.searchParams.set('category', filterAttack)
  url.searchParams.set('select', '*,profiles(*)')
  url.searchParams.set('order', 'title; DROP TABLE public.courses')
  const response = await GET(new NextRequest(url))
  assert.equal(response.status, 200)
  assert.equal(requests.length, 1)
  const request = requests[0]
  assert.equal(request.pathname, '/rest/v1/courses')
  assert.equal(request.searchParams.get('category'), `eq.${filterAttack}`)
  assert.equal(request.searchParams.get('search_document'), `wfts(english).${attack}`)
  assert.equal(request.searchParams.get('order'), 'id.asc')
  assert.equal(request.searchParams.has('or'), false)
  assert.equal(request.searchParams.has('and'), false)
  assert.equal(request.searchParams.get('select').includes('profiles'), false)
})

test('catalog injection in UUID cursors and numeric limits is rejected before contacting the database', async () => {
  const { GET, requests } = setup()
  for (const [key, value] of [
    ['cursor', "' OR 1=1 --"],
    ['limit', '1; SELECT pg_sleep(10)'],
  ]) {
    const url = new URL('http://localhost:3000/api/courses')
    url.searchParams.set(key, value)
    assert.equal((await GET(new NextRequest(url))).status, 400)
  }
  assert.equal(requests.length, 0)
})
