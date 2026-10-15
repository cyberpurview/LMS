import 'server-only'
export class RequestBodyTooLarge extends Error {
  constructor() {
    super('Request too large')
  }
}
export async function readBoundedText(
  request: Pick<Request, 'headers' | 'body'>,
  maxBytes: number,
) {
  const declared = Number(request.headers.get('content-length'))
  if (Number.isFinite(declared) && declared > maxBytes) throw new RequestBodyTooLarge()
  const reader = request.body?.getReader()
  if (!reader) return ''
  let size = 0
  const chunks: Uint8Array[] = []
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new RequestBodyTooLarge()
      }
      chunks.push(value)
    }
    return Buffer.concat(chunks).toString('utf8')
  } finally {
    reader.releaseLock()
  }
}
