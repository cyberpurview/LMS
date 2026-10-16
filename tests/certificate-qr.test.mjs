import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import vm from 'node:vm'
import ts from 'typescript'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import sharp from 'sharp'
import jsQR from 'jsqr'
const require = createRequire(import.meta.url)
const compile = (source) =>
  ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
      jsx: ts.JsxEmit.ReactJSX,
      esModuleInterop: true,
    },
  }).outputText
const helpers = {}
vm.runInNewContext(
  compile(await readFile(new URL('../src/lib/lms/certificate-qr.ts', import.meta.url), 'utf8')),
  {
    exports: helpers,
    URL,
    Error,
    require: (name) => (name === '@/lib/brand' ? { BRAND_NAVY: '#0e273f' } : require(name)),
  },
)
const id = 'beb393ae-989d-410c-a373-8f6c25ce228f'

test('certificate QR codes decode to the exact public verification URL and remain sharp in print', async () => {
  for (const origin of ['https://learn.example.com', 'http://localhost:3000']) {
    const svg = helpers.certificateQrSvg(id, origin)
    for (const size of [120, 480]) {
      const { data, info } = await sharp(Buffer.from(svg))
        .resize(size, size, { kernel: 'nearest' })
        .ensureAlpha()
        .raw()
        .toBuffer({ resolveWithObject: true })
      const result = jsQR(new Uint8ClampedArray(data), info.width, info.height)
      assert.ok(result, 'QR must decode with an independent decoder')
      assert.equal(result.data, origin + '/certificates/' + id)
    }
    assert.equal(svg.includes('<script'), false)
    assert.equal(svg.includes('http'), true)
  }
  assert.throws(
    () => helpers.certificateVerificationUrl('invalid-id', 'https://learn.example.com'),
    /identifier/,
  )
  assert.throws(() => helpers.certificateVerificationUrl(id, 'javascript:alert(1)'), /origin/)
  assert.throws(
    () => helpers.certificateVerificationUrl(id, 'https://user:password@example.com'),
    /origin/,
  )
})

test('certificate QR rendering is local, has a usable verification link and avoids nested thumbnail links', async () => {
  const { JSDOM } = require('jsdom')
  const dom = new JSDOM('<div id="root"></div>', {
    url: 'https://learn.example.com',
    pretendToBeVisual: true,
  })
  globalThis.window = dom.window
  globalThis.document = dom.window.document
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const React = require('react'),
    { createRoot } = require('react-dom/client'),
    exports = {}
  vm.runInNewContext(
    compile(
      await readFile(
        new URL('../src/components/shared/CertificateVerification.tsx', import.meta.url),
        'utf8',
      ),
    ),
    {
      exports,
      window,
      require: (name) =>
        name === '@/lib/lms/certificate-qr'
          ? helpers
          : name === 'next/image'
            ? {
                __esModule: true,
                default: ({ unoptimized, ...props }) => React.createElement('img', props),
              }
            : require(name),
    },
  )
  const root = createRoot(document.getElementById('root'))
  try {
    await React.act(async () =>
      root.render(React.createElement(exports.CertificateVerification, { id })),
    )
    assert.equal(document.querySelector('a').href, 'https://learn.example.com/certificates/' + id)
    assert.ok(document.querySelector('img').src.startsWith('data:image/svg+xml'))
    assert.equal(document.body.textContent.includes('Scan to verify'), false)
    assert.equal(document.querySelector('a').getAttribute('aria-label'), 'Verify this certificate')
    assert.equal(document.body.textContent.includes(id), false)
    await React.act(async () =>
      root.render(
        React.createElement(
          'a',
          { href: '/certificates/' + id },
          React.createElement(exports.CertificateVerification, { id, miniature: true }),
        ),
      ),
    )
    assert.equal(document.querySelectorAll('a').length, 1)
    assert.equal(document.querySelector('img').alt, '')
  } finally {
    await React.act(async () => root.unmount())
    dom.window.close()
    globalThis.IS_REACT_ACT_ENVIRONMENT = false
  }
})
