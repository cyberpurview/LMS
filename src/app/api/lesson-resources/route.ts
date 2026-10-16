import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getIdentity } from '@/lib/server/auth'
import { storageAdmin } from '@/lib/server/storage'
import { validateLessonPdf } from '@/lib/server/pdf'
import { RESOURCE_BUCKET, RESOURCE_MAX_BYTES } from '@/lib/lms/resources'
import type { Json } from '@/types/database.types'

export const runtime = 'nodejs'
const privateHeaders = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
class ResourceError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message)
  }
}
async function identity() {
  const value = await getIdentity()
  if (!value) throw new ResourceError('Please sign in.', 401)
  return value
}
async function command(auth: Awaited<ReturnType<typeof identity>>, action: string, payload: Json) {
  const result = await auth.client.rpc('lesson_resource_command', { action, payload })
  if (result.error)
    throw new ResourceError(
      result.error.message,
      result.error.code === '42501' ? 403 : result.error.message.startsWith('Too many') ? 429 : 400,
    )
  return result.data
}
function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof Error ? error.message : 'Unable to access lesson resources.' },
    { status: error instanceof ResourceError ? error.status : 400, headers: privateHeaders },
  )
}
function checkOrigin(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    throw new ResourceError('Invalid request origin', 403)
}
export async function GET(request: NextRequest) {
  try {
    const auth = await identity()
    const id = request.nextUrl.searchParams.get('id')
    if (!id) {
      const lessonId = z.string().uuid().parse(request.nextUrl.searchParams.get('lessonId'))
      return NextResponse.json(
        { resources: await command(auth, 'list', { lessonId }) },
        { headers: privateHeaders },
      )
    }
    const resource = (await command(auth, 'read', { id: z.string().uuid().parse(id) })) as {
      path: string
      name: string
    }
    const download = request.nextUrl.searchParams.get('download') === '1'
    const signed = await storageAdmin()
      .storage.from(RESOURCE_BUCKET)
      .createSignedUrl(resource.path, 600, download ? { download: resource.name } : undefined)
    if (signed.error || !signed.data?.signedUrl)
      throw new ResourceError('This PDF is unavailable. Please try again.')
    if (download || request.nextUrl.searchParams.get('open') === '1') {
      const response = NextResponse.redirect(signed.data.signedUrl)
      Object.entries(privateHeaders).forEach(([key, value]) => response.headers.set(key, value))
      return response
    }
    return NextResponse.json({ url: signed.data.signedUrl }, { headers: privateHeaders })
  } catch (error) {
    return failure(error)
  }
}
export async function POST(request: NextRequest) {
  let uploadedPath: string | undefined
  let bucket: ReturnType<ReturnType<typeof storageAdmin>['storage']['from']> | undefined
  try {
    checkOrigin(request)
    const auth = await identity()
    if (!['admin', 'tutor'].includes(auth.user.role))
      throw new ResourceError('Course management access required.', 403)
    if (Number(request.headers.get('content-length') || 0) > RESOURCE_MAX_BYTES + 16384)
      throw new ResourceError('Choose a PDF up to 20 MB.', 413)
    const reader = request.body?.getReader()
    if (!reader) throw new ResourceError('Choose a PDF to upload.')
    const chunks: Buffer[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > RESOURCE_MAX_BYTES + 16384) {
        await reader.cancel()
        throw new ResourceError('Choose a PDF up to 20 MB.', 413)
      }
      chunks.push(Buffer.from(value))
    }
    const form = await new Response(Buffer.concat(chunks), { headers: request.headers }).formData()
    const lessonId = z.string().uuid().parse(form.get('lessonId'))
    const file = form.get('file')
    if (
      !(file instanceof File) ||
      !file.name.toLowerCase().endsWith('.pdf') ||
      (file.type && file.type !== 'application/pdf')
    )
      throw new ResourceError('Choose a PDF file.')
    if (file.size > RESOURCE_MAX_BYTES) throw new ResourceError('Choose a PDF up to 20 MB.', 413)
    const prepared = (await command(auth, 'prepare', { lessonId })) as { courseId: string }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const pages = await validateLessonPdf(bytes)
    const id = randomUUID()
    const path = `${prepared.courseId}/${lessonId}/${id}.pdf`
    const name = file.name.replace(/[\x00-\x1f\x7f/\\]/g, '_').slice(0, 200)
    bucket = storageAdmin().storage.from(RESOURCE_BUCKET)
    const uploaded = await bucket.upload(path, bytes, {
      contentType: 'application/pdf',
      upsert: false,
      cacheControl: '600',
    })
    if (uploaded.error) throw new ResourceError('PDF upload failed. Please try again.')
    uploadedPath = path
    const resource = await command(auth, 'add', {
      id,
      lessonId,
      path,
      name,
      bytes: bytes.byteLength,
      pages,
    })
    uploadedPath = undefined
    return NextResponse.json({ resource }, { headers: privateHeaders })
  } catch (error) {
    if (uploadedPath && bucket) await bucket.remove([uploadedPath]).catch(() => {})
    return failure(error)
  }
}
export async function DELETE(request: NextRequest) {
  try {
    checkOrigin(request)
    const auth = await identity()
    const id = z.string().uuid().parse(request.nextUrl.searchParams.get('id'))
    const removed = (await command(auth, 'remove', { id })) as { path: string }
    // Metadata is removed first so an orphaned object cannot be opened by the API.
    await storageAdmin()
      .storage.from(RESOURCE_BUCKET)
      .remove([removed.path])
      .catch(() => {})
    return NextResponse.json({ removed: true }, { headers: privateHeaders })
  } catch (error) {
    return failure(error)
  }
}
