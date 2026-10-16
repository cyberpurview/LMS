import assert from 'node:assert/strict'
import { test } from 'node:test'
import { requestBody } from './helpers/request-body.mjs'
test('command body limits count streamed bytes and stop reading without trusting Content-Length', async () => {
  let pulled = 0,
    cancelled = false
  const body = new ReadableStream({
    pull(controller) {
      pulled++
      controller.enqueue(new Uint8Array(1024))
    },
    cancel() {
      cancelled = true
    },
  })
  await assert.rejects(
    requestBody.readBoundedText(
      new Request('http://localhost/test', { method: 'POST', body, duplex: 'half' }),
      1500,
    ),
    requestBody.RequestBodyTooLarge,
  )
  assert.ok(cancelled)
  assert.ok(pulled <= 3)
  await assert.rejects(
    requestBody.readBoundedText(
      new Request('http://localhost/test', { method: 'POST', body: '😀😀' }),
      7,
    ),
    requestBody.RequestBodyTooLarge,
  )
  assert.equal(
    await requestBody.readBoundedText(
      new Request('http://localhost/test', { method: 'POST', body: 'hello' }),
      5,
    ),
    'hello',
  )
})
