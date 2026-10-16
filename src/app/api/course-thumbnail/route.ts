import { NextRequest, NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { z } from 'zod'
import { getIdentity } from '@/lib/server/auth'
import { storageAdmin } from '@/lib/server/storage'
import { prepareThumbnail } from '@/lib/server/thumbnail'
import { THUMBNAIL_BUCKET, THUMBNAIL_MAX_BYTES, THUMBNAIL_TYPES } from '@/lib/lms/thumbnail'

export const runtime = 'nodejs'
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403 })
  if (Number(request.headers.get('content-length') || 0) > THUMBNAIL_MAX_BYTES + 16384)
    return NextResponse.json({ error: 'Choose an image up to 5 MB.' }, { status: 413 })
  try {
    const identity = await getIdentity()
    if (!identity) return NextResponse.json({ error: 'Please sign in' }, { status: 401 })
    if (!['admin', 'tutor'].includes(identity.user.role))
      return NextResponse.json({ error: 'Course management access required' }, { status: 403 })
    const reader = request.body?.getReader()
    if (!reader) throw new Error('Choose an image to upload.')
    const chunks: Buffer[] = []
    let received = 0
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      received += value.byteLength
      if (received > THUMBNAIL_MAX_BYTES + 16384) {
        await reader.cancel()
        return NextResponse.json({ error: 'Choose an image up to 5 MB.' }, { status: 413 })
      }
      chunks.push(Buffer.from(value))
    }
    const form = await new Response(Buffer.concat(chunks), { headers: request.headers }).formData()
    const courseId = z.string().uuid().parse(form.get('courseId'))
    const file = form.get('file')
    if (!(file instanceof File) || !THUMBNAIL_TYPES.includes(file.type))
      return NextResponse.json({ error: 'Choose a JPG, PNG, or WebP image.' }, { status: 400 })
    if (file.size > THUMBNAIL_MAX_BYTES)
      return NextResponse.json({ error: 'Choose an image up to 5 MB.' }, { status: 413 })
    const { error } = await identity.client.rpc('course_upload_guard', { course_id: courseId })
    if (error)
      return NextResponse.json(
        { error: error.message },
        { status: error.code === '42501' ? 403 : error.message.startsWith('Too many') ? 429 : 503 },
      )
    const image = await prepareThumbnail(Buffer.from(await file.arrayBuffer()))
    const bucket = storageAdmin().storage.from(THUMBNAIL_BUCKET)
    const path = `${identity.user.id}/${courseId}/${randomUUID()}.webp`
    const uploaded = await bucket.upload(path, image, {
      contentType: 'image/webp',
      cacheControl: '31536000',
      upsert: false,
    })
    if (uploaded.error) throw new Error('Image upload failed. Please try again.')
    return NextResponse.json(
      { url: bucket.getPublicUrl(path).data.publicUrl },
      { headers: { 'Cache-Control': 'private, no-store' } },
    )
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Image upload failed.' },
      { status: 400 },
    )
  }
}
