import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import sharp from 'sharp'
import ts from 'typescript'
const require = createRequire(import.meta.url)
const { NextRequest } = require('next/server')
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      esModuleInterop: true,
    },
  }).outputText
const settings = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/thumbnail.ts', import.meta.url), 'utf8')),
  { exports: settings },
)
const processing = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/server/thumbnail.ts', import.meta.url), 'utf8')),
  {
    exports: processing,
    Error,
    Buffer,
    require: (name) => (name === '@/lib/lms/thumbnail' ? settings : require(name)),
  },
)
const route = compile(
  await readFile(new URL('../src/app/api/course-thumbnail/route.ts', import.meta.url), 'utf8'),
)
const courseId = '11111111-1111-4111-8111-111111111111'
const userId = '22222222-2222-4222-8222-222222222222'
const image = (width, height) =>
  sharp({ create: { width, height, channels: 3, background: '#2563eb' } })
    .png()
    .toBuffer()
const valid = await image(1280, 720)
function setup({ role = 'tutor', owner = userId, failed = false, limited = false } = {}) {
  const events = []
  const bucket = {
    upload: async (path, bytes, options) => {
      events.push({ path, bytes, options })
      return { error: failed ? new Error('Failure') : null }
    },
    getPublicUrl: (path) => ({
      data: {
        publicUrl: 'https://example.supabase.co/storage/v1/object/public/course-thumbnails/' + path,
      },
    }),
  }
  const exports = {}
  vm.runInNewContext(route, {
    exports,
    Buffer,
    File,
    Response,
    Error,
    require: (name) => {
      if (name === '@/lib/lms/thumbnail') return settings
      if (name === '@/lib/server/thumbnail') return processing
      if (name === '@/lib/server/storage')
        return { storageAdmin: () => ({ storage: { from: () => bucket } }) }
      if (name === '@/lib/server/auth')
        return {
          getIdentity: async () =>
            role
              ? {
                  user: { role, id: userId },
                  client: {
                    rpc: async () => ({
                      error:
                        owner && role === 'tutor' && owner !== userId
                          ? {
                              code: '42501',
                              message: 'You can only change your own course images.',
                            }
                          : limited
                            ? { message: 'Too many course requests. Try again later.' }
                            : null,
                    }),
                    from: () => ({
                      select: () => ({
                        eq: () => ({
                          maybeSingle: async () => ({
                            data: owner ? { tutor_id: owner } : null,
                            error: null,
                          }),
                        }),
                      }),
                    }),
                  },
                }
              : null,
        }
      return require(name)
    },
  })
  return { post: exports.POST, events }
}
function request(bytes = valid, origin = 'http://localhost:3000') {
  const form = new FormData()
  form.set('courseId', courseId)
  form.set('file', new File([bytes], 'thumbnail.png', { type: 'image/png' }))
  return new NextRequest('http://localhost:3000/api/course-thumbnail', {
    method: 'POST',
    headers: { origin },
    body: form,
  })
}
test('thumbnail processing preserves exact ratio, handles orientation and produces optimized WebP', async () => {
  for (const [width, height] of [
    [1280, 720],
    [640, 360],
    [2560, 1440],
  ]) {
    const result = await processing.prepareThumbnail(await image(width, height))
    const metadata = await sharp(result).metadata()
    assert.equal(metadata.format, 'webp')
    assert.equal(metadata.width * 9, metadata.height * 16)
    assert.ok(metadata.width <= 1280)
  }
  const rotated = await sharp(await image(720, 1280))
    .jpeg()
    .withMetadata({ orientation: 6 })
    .toBuffer()
  const metadata = await sharp(await processing.prepareThumbnail(rotated)).metadata()
  assert.equal(metadata.width, 1280)
  assert.equal(metadata.height, 720)
})
test('thumbnail processing rejects wrong ratios, small images, oversize and corrupt bytes', async () => {
  await assert.rejects(processing.prepareThumbnail(await image(800, 600)), /exactly 16:9/)
  await assert.rejects(processing.prepareThumbnail(await image(320, 180)), /at least 640/)
  await assert.rejects(
    processing.prepareThumbnail(Buffer.alloc(settings.THUMBNAIL_MAX_BYTES + 1)),
    /5 MB/,
  )
  await assert.rejects(processing.prepareThumbnail(Buffer.from('not an image')))
})
test('upload requires same-origin staff authentication and tutor ownership', async () => {
  for (const [options, status] of [
    [{ role: null }, 401],
    [{ role: 'learner' }, 403],
    [{ owner: 'someone-else' }, 403],
  ]) {
    const api = setup(options)
    assert.equal((await api.post(request())).status, status)
    assert.equal(api.events.length, 0)
  }
  const api = setup()
  assert.equal((await api.post(request(valid, 'https://other.example'))).status, 403)
  assert.equal(api.events.length, 0)
})
test('tutors and admins upload validated images to immutable course paths', async () => {
  for (const options of [
    { role: 'tutor' },
    { role: 'admin', owner: 'another-tutor' },
    { role: 'tutor', owner: null },
  ]) {
    const api = setup(options)
    const response = await api.post(request())
    assert.equal(response.status, 200)
    const uploaded = api.events[0]
    assert.ok(uploaded.path.startsWith(`${userId}/${courseId}/`))
    assert.equal(uploaded.options.upsert, false)
    assert.equal(uploaded.options.contentType, 'image/webp')
    assert.equal((await sharp(uploaded.bytes).metadata()).width, 1280)
    assert.ok((await response.json()).url.endsWith(uploaded.path))
    assert.equal(response.headers.get('cache-control'), 'private, no-store')
  }
})
test('thumbnail quota rejection stops image processing and storage writes', async () => {
  const api = setup({ limited: true })
  assert.equal((await api.post(request())).status, 429)
  assert.equal(api.events.length, 0)
})
test('invalid images and failed uploads never return a thumbnail URL', async () => {
  const api = setup()
  const invalid = await api.post(request(await image(800, 600)))
  assert.equal(invalid.status, 400)
  assert.match((await invalid.json()).error, /16:9/)
  assert.equal(api.events.length, 0)
  const failed = await setup({ failed: true }).post(request())
  assert.equal(failed.status, 400)
  assert.equal((await failed.json()).url, undefined)
})
