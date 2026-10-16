import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import ts from 'typescript'
import { PDFDocument } from 'pdf-lib'
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
    },
  }).outputText
const settings = {},
  pdf = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/resources.ts', import.meta.url), 'utf8')),
  { exports: settings },
)
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/server/pdf.ts', import.meta.url), 'utf8')),
  {
    exports: pdf,
    Error,
    Buffer,
    require: (name) =>
      name === 'server-only' ? {} : name === '@/lib/lms/resources' ? settings : require(name),
  },
)
const source = compile(
  await readFile(new URL('../src/app/api/lesson-resources/route.ts', import.meta.url), 'utf8'),
)
const doc = await PDFDocument.create()
doc.addPage().drawText('CyberPurview lesson reference')
const valid = await doc.save()
const lessonId = randomUUID(),
  courseId = randomUUID(),
  resourceId = randomUUID()
function api({ role = 'tutor', denied = false, registrationFails = false } = {}) {
  const exports = {},
    events = []
  vm.runInNewContext(source, {
    exports,
    Error,
    Buffer,
    Response,
    File,
    Uint8Array,
    require: (name) => {
      if (name === '@/lib/server/pdf') return pdf
      if (name === '@/lib/lms/resources') return settings
      if (name === '@/lib/server/auth')
        return {
          getIdentity: async () =>
            role
              ? {
                  user: { role },
                  client: {
                    rpc: async (_fn, { action, payload }) => {
                      events.push(['command', action, payload])
                      if (denied || (registrationFails && action === 'add'))
                        return {
                          error: { code: denied ? '42501' : 'P0001', message: 'Access denied' },
                        }
                      return {
                        data:
                          action === 'prepare'
                            ? { courseId }
                            : action === 'list'
                              ? []
                              : action === 'add'
                                ? { id: payload.id, name: payload.name, pages: payload.pages }
                                : {
                                    path: `${courseId}/${lessonId}/${resourceId}.pdf`,
                                    name: 'Reference.pdf',
                                  },
                      }
                    },
                  },
                }
              : null,
        }
      if (name === '@/lib/server/storage')
        return {
          storageAdmin: () => ({
            storage: {
              from: (bucket) => ({
                upload: async (path, bytes, options) => {
                  events.push(['upload', bucket, path, bytes, options])
                  return { error: null }
                },
                remove: async (paths) => {
                  events.push(['remove', paths])
                  return { error: null }
                },
                createSignedUrl: async (path, seconds, options) => {
                  events.push(['sign', path, seconds, options])
                  return {
                    data: {
                      signedUrl:
                        'https://test.supabase.co/storage/v1/object/sign/lesson-resources/reference.pdf?token=test',
                    },
                  }
                },
              }),
            },
          }),
        }
      return require(name)
    },
  })
  return { ...exports, events }
}
function upload(bytes = valid, origin = 'http://localhost:3000') {
  const form = new FormData()
  form.set('lessonId', lessonId)
  form.set('file', new File([bytes], 'reference.pdf', { type: 'application/pdf' }))
  return new NextRequest('http://localhost:3000/api/lesson-resources', {
    method: 'POST',
    headers: { origin },
    body: form,
  })
}
test('PDF validation checks real content and page count rather than trusting a file extension', async () => {
  assert.equal(await pdf.validateLessonPdf(valid), 1)
  await assert.rejects(pdf.validateLessonPdf(Buffer.from('<html>not a PDF</html>')), /not a PDF/)
  await assert.rejects(
    pdf.validateLessonPdf(Buffer.from('%PDF-1.7\nnot a document')),
    /could not be read/,
  )
  await assert.rejects(
    pdf.validateLessonPdf(new Uint8Array(settings.RESOURCE_MAX_BYTES + 1)),
    /20 MB/,
  )
})
test('PDF upload requires same-origin staff access and lesson ownership before storage writes', async () => {
  for (const [options, status] of [
    [{ role: null }, 401],
    [{ role: 'learner' }, 403],
    [{ denied: true }, 403],
  ]) {
    const a = api(options)
    assert.equal((await a.POST(upload())).status, status)
    assert.ok(!a.events.some(([type]) => type === 'upload'))
  }
  const a = api()
  assert.equal((await a.POST(upload(valid, 'https://other.example'))).status, 403)
  assert.equal(a.events.length, 0)
  const huge = new NextRequest('http://localhost:3000/api/lesson-resources', {
    method: 'POST',
    headers: {
      origin: 'http://localhost:3000',
      'content-length': String(settings.RESOURCE_MAX_BYTES + 20000),
    },
    body: 'x',
  })
  assert.equal((await a.POST(huge)).status, 413)
})
test('PDF uploads use private immutable paths and clean up failed registration', async () => {
  const a = api()
  const response = await a.POST(upload())
  assert.equal(response.status, 200)
  assert.equal((await response.json()).resource.pages, 1)
  const saved = a.events.find(([type]) => type === 'upload')
  assert.equal(saved[1], 'lesson-resources')
  assert.ok(saved[2].startsWith(`${courseId}/${lessonId}/`))
  assert.equal(saved[4].upsert, false)
  assert.equal(saved[4].contentType, 'application/pdf')
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const failed = api({ registrationFails: true })
  assert.equal((await failed.POST(upload())).status, 400)
  assert.ok(failed.events.some(([type]) => type === 'remove'))
  const invalid = api()
  assert.equal((await invalid.POST(upload(Buffer.from('not a PDF')))).status, 400)
  assert.ok(!invalid.events.some(([type]) => type === 'upload'))
})
test('preview and download URLs are issued only after enrollment checks, with private responses', async () => {
  const denied = api({ role: 'learner', denied: true })
  const request = () =>
    new NextRequest(`http://localhost:3000/api/lesson-resources?id=${resourceId}`)
  assert.equal((await denied.GET(request())).status, 403)
  assert.ok(!denied.events.some(([type]) => type === 'sign'))
  const a = api({ role: 'learner' })
  const response = await a.GET(request())
  assert.ok((await response.json()).url.includes('/object/sign/'))
  assert.equal(response.headers.get('cache-control'), 'private, no-store')
  const download = await a.GET(
    new NextRequest(`http://localhost:3000/api/lesson-resources?id=${resourceId}&download=1`),
  )
  assert.equal(download.status, 307)
  assert.equal(a.events.filter(([type]) => type === 'sign').at(-1)[3].download, 'Reference.pdf')
  assert.equal(download.headers.get('referrer-policy'), 'no-referrer')
  const noOrigin = await a.DELETE(
    new NextRequest(`http://localhost:3000/api/lesson-resources?id=${resourceId}`, {
      method: 'DELETE',
    }),
  )
  assert.equal(noOrigin.status, 403)
})

test('lesson resources UI loads metadata, opens the protected PDF viewer and confirms removal', async () => {
  const code = compile(
    await readFile(
      new URL('../src/components/features/lesson-resources.tsx', import.meta.url),
      'utf8',
    ),
  )
  const exports = {},
    slots = [],
    refs = [],
    effects = [],
    events = []
  let index = 0,
    refIndex = 0,
    mounted = false
  const resource = { id: resourceId, name: 'Reference.pdf', bytes: 1000, pages: 1 }
  vm.runInNewContext(code, {
    exports,
    Error,
    AbortController,
    FormData,
    require: (name) => {
      if (name === 'react')
        return {
          useState: (initial) => {
            const slot = index++
            if (!(slot in slots)) slots[slot] = initial
            return [
              slots[slot],
              (v) => (slots[slot] = typeof v === 'function' ? v(slots[slot]) : v),
            ]
          },
          useRef: (initial) => {
            const slot = refIndex++
            return (refs[slot] ||= { current: initial })
          },
          useEffect: (fn) => {
            if (!mounted) effects.push(fn)
          },
        }
      if (name === '@/lib/lms/resources') return settings
      if (name === './common') return { inputClass: 'input', secondaryClass: 'button' }
      return require(name)
    },
    fetch: async (url, options = {}) => {
      events.push([url, options])
      return {
        ok: true,
        json: async () =>
          options.method === 'DELETE'
            ? { removed: true }
            : url.includes('lessonId=')
              ? { resources: [resource] }
              : { url: 'https://test.supabase.co/signed-reference.pdf' },
      }
    },
  })
  const nodes = (n) =>
    !n || typeof n !== 'object'
      ? []
      : Array.isArray(n)
        ? n.flatMap(nodes)
        : [n, ...nodes(n.props?.children)]
  const render = () => {
    index = 0
    refIndex = 0
    return nodes(exports.LessonResources({ lessonId, editable: true }))
  }
  render()
  mounted = true
  effects.forEach((fn) => fn())
  await new Promise((resolve) => setTimeout(resolve, 0))
  const preview = render().find((n) => n.type === 'button' && n.props.children === 'Preview PDF')
  assert.ok(preview)
  preview.props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  const iframe = render().find((n) => n.type === 'iframe')
  assert.ok(iframe)
  assert.equal(iframe.props.title, 'PDF viewer: Reference.pdf')
  assert.equal(iframe.props.referrerPolicy, 'no-referrer')
  assert.ok(events.some(([url]) => url.endsWith(`id=${resourceId}`)))
  render()
    .find((n) => n.type === 'button' && n.props.children?.includes?.('Remove'))
    .props.onClick()
  assert.ok(!events.some(([, options]) => options.method === 'DELETE'))
  render()
    .find((n) => n.type === 'button' && n.props.children === 'Yes, remove')
    .props.onClick()
  await new Promise((resolve) => setTimeout(resolve, 0))
  assert.ok(events.some(([, options]) => options.method === 'DELETE'))
  assert.equal(
    render().some((n) => n.type === 'iframe'),
    false,
  )
})
