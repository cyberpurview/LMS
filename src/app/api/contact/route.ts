import { NextRequest, NextResponse } from 'next/server'
import { createHmac, createHash } from 'node:crypto'
import { isIP } from 'node:net'
import { contactSchema } from '@/lib/lms/contact'
import { storageAdmin } from '@/lib/server/storage'
import { readBoundedText, RequestBodyTooLarge } from '@/lib/server/request-body'

export const runtime = 'nodejs'
export const maxDuration = 30
const headers = { 'Cache-Control': 'no-store' }
const reply = (error: string, status: number) => NextResponse.json({ error }, { status, headers })
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return reply('Invalid request origin.', 403)
  if (request.headers.get('content-type')?.split(';')[0].trim() !== 'application/json')
    return reply('Send a JSON request.', 415)
  try {
    const parsed = contactSchema.safeParse(JSON.parse(await readBoundedText(request, 24576)))
    if (!parsed.success)
      return reply('Check your details. Your message must be between 20 and 5,000 characters.', 400)
    const data = parsed.data
    if (data.website) return NextResponse.json({ sent: true }, { headers })
    if (Date.now() - data.startedAt < 2000 || data.startedAt > Date.now())
      return reply('Please wait a moment before sending.', 400)
    const key = process.env.RESEND_API_KEY,
      sender = process.env.NOTIFICATION_EMAIL_FROM,
      recipient = process.env.CONTACT_EMAIL_TO,
      salt = process.env.CRON_SECRET
    if (!key || !sender || !recipient || !salt)
      return reply('Contact messages are temporarily unavailable. Please try again later.', 503)
    const forwarded =
      process.env.VERCEL === '1'
        ? request.headers.get('x-forwarded-for')?.split(',')[0].trim()
        : 'local'
    const ip = forwarded && (forwarded === 'local' || isIP(forwarded)) ? forwarded : 'unknown'
    const hash = (value: string) => createHmac('sha256', salt).update(value).digest('hex')
    const payloadHash = createHash('sha256')
      .update(JSON.stringify([data.name, data.email, data.subject, data.message]))
      .digest('hex')
    const admin = storageAdmin(5000)
    const limited = await admin.rpc('claim_contact_message', {
      request_id: data.requestId,
      ip_hash: hash(ip),
      email_hash: hash(data.email),
      payload_hash: payloadHash,
    })
    if (limited.error) return reply('Unable to send right now. Please try again later.', 503)
    if (limited.data === 'sent') return NextResponse.json({ sent: true }, { headers })
    if (limited.data === 'wait')
      return NextResponse.json(
        { error: 'Please wait 15 seconds before retrying.' },
        { status: 429, headers: { ...headers, 'Retry-After': '15' } },
      )
    if (limited.data === 'conflict')
      return reply('This request has changed. Please edit your message and try again.', 409)
    if (limited.data !== 'allowed')
      return NextResponse.json(
        { error: 'Too many messages. Please try again later.' },
        { status: 429, headers: { ...headers, 'Retry-After': '3600' } },
      )
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      signal: AbortSignal.timeout(10000),
      headers: {
        Authorization: `Bearer ${key}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': `contact/${data.requestId}`,
      },
      body: JSON.stringify({
        from: sender,
        to: [recipient],
        reply_to: data.email,
        subject: `CyberPurview contact: ${data.subject}`,
        text: `Name: ${data.name}\nEmail: ${data.email}\nSubject: ${data.subject}\n\n${data.message}`,
      }),
    })
    if (!response.ok)
      return reply(
        'Unable to send your message right now. Your details have been kept so you can try again.',
        503,
      )
    const finished = await admin.rpc('finish_contact_message', {
      request_id: data.requestId,
      payload_hash: payloadHash,
    })
    if (finished.error)
      return reply('Unable to confirm delivery. Please wait 15 seconds and try again.', 503)
    return NextResponse.json({ sent: true }, { headers })
  } catch (error) {
    if (error instanceof RequestBodyTooLarge) return reply('Your message is too large.', 413)
    if (error instanceof SyntaxError) return reply('Invalid message format.', 400)
    return reply('Unable to send your message right now. Please try again.', 503)
  }
}
