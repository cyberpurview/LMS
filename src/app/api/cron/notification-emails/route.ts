import { NextRequest, NextResponse } from 'next/server'
import { timingSafeEqual } from 'node:crypto'
import { storageAdmin } from '@/lib/server/storage'
import { BRAND_NAME } from '@/lib/brand'
import { cleanupCourseResources } from '@/lib/server/course-resource-cleanup'
export const runtime = 'nodejs'
export const maxDuration = 60
export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET
  const token = request.headers.get('authorization') || ''
  const expected = `Bearer ${secret}`
  const suppliedBytes = Buffer.from(token)
  const expectedBytes = Buffer.from(expected)
  if (
    !secret ||
    suppliedBytes.length !== expectedBytes.length ||
    !timingSafeEqual(suppliedBytes, expectedBytes)
  )
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const key = process.env.RESEND_API_KEY
  await cleanupCourseResources().catch(() => {})
  const sender = process.env.NOTIFICATION_EMAIL_FROM
  const site = process.env.APP_URL
  if (!key || !sender || !site)
    return NextResponse.json(
      { error: 'Configure RESEND_API_KEY, NOTIFICATION_EMAIL_FROM and APP_URL first.' },
      { status: 503 },
    )
  let base: URL
  try {
    base = new URL(site)
    if (!['https:', 'http:'].includes(base.protocol)) throw new Error()
  } catch {
    return NextResponse.json({ error: 'Invalid APP_URL' }, { status: 503 })
  }
  const client = storageAdmin()
  const { data, error } = await client.rpc('claim_notification_emails')
  if (error) return NextResponse.json({ error: 'Unable to claim queued emails' }, { status: 500 })
  const items = data as {
    id: string
    email: string
    title: string
    message: string
    href: string
  }[]
  let sent = 0
  let failed = 0
  const started = Date.now()
  for (const item of items) {
    if (Date.now() - started > 45000) break
    let delivered = false
    try {
      const link =
        item.href.startsWith('/') && !item.href.startsWith('//')
          ? new URL(item.href, base).toString()
          : base.toString()
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        signal: AbortSignal.timeout(8000),
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
          'Idempotency-Key': `notification/${item.id}`,
        },
        body: JSON.stringify({
          from: sender,
          to: [item.email],
          subject: `${BRAND_NAME}: ${item.title}`,
          text: `${item.title}\n\n${item.message}\n\nOpen your workspace: ${link}\n\nManage notification preferences in your account settings.`,
        }),
      })
      delivered = response.ok
    } catch {
      delivered = false
    }
    const completed = await client.rpc('finish_notification_email', {
      email_id: item.id,
      delivered,
    })
    if (completed.error)
      return NextResponse.json(
        { error: 'Email queue acknowledgement failed; retry will use the same idempotency key.' },
        { status: 500 },
      )
    delivered ? sent++ : failed++
    await new Promise((resolve) => setTimeout(resolve, 600))
  }
  return NextResponse.json({ sent, failed }, { headers: { 'Cache-Control': 'private, no-store' } })
}
