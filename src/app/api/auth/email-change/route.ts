import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { getIdentity } from '@/lib/server/auth'
import { createEmailClient } from '@/lib/supabase/email-client'
import { storageAdmin } from '@/lib/server/storage'
import { readBoundedText, RequestBodyTooLarge } from '@/lib/server/request-body'
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
const emailChangesEnabled = () => process.env.AUTH_EMAIL_CHANGE_ENABLED === 'true'
const schema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('send') }),
  z.object({
    action: z.literal('change'),
    email: z.string().trim().email().max(254),
    code: z.string().regex(/^\d{6,10}$/),
  }),
  z.object({ action: z.literal('cancel') }),
])
export async function GET() {
  try {
    const identity = await getIdentity()
    if (!identity) return NextResponse.json({ error: 'Please sign in' }, { status: 401, headers })
    const { data, error } = await identity.client.auth.getUser()
    if (error || !data.user)
      return NextResponse.json({ error: 'Please sign in' }, { status: 401, headers })
    return NextResponse.json(
      {
        email: data.user.email,
        available: emailChangesEnabled(),
        pendingEmail: data.user.new_email || null,
        linkedGoogle: data.user.identities?.some((i) => i.provider === 'google') || false,
      },
      { headers },
    )
  } catch {
    return NextResponse.json({ error: 'Unable to load email settings.' }, { status: 503, headers })
  }
}
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers })
  try {
    const identity = await getIdentity()
    if (!identity) return NextResponse.json({ error: 'Please sign in' }, { status: 401, headers })
    const parsed = schema.safeParse(JSON.parse(await readBoundedText(request, 2048)))
    if (!parsed.success)
      return NextResponse.json(
        { error: 'Enter a valid email and verification code.' },
        { status: 400, headers },
      )
    const command = parsed.data
    if (command.action !== 'cancel' && !emailChangesEnabled())
      return NextResponse.json(
        { error: 'Email changes are temporarily unavailable. Please contact support.' },
        { status: 503, headers },
      )
    const limited = await identity.client.rpc('email_change_quota', {
      operation: command.action === 'change' ? 'verify' : command.action,
    })
    if (limited.error)
      return NextResponse.json(
        { error: 'Too many requests. Try again later.' },
        { status: 429, headers },
      )
    if (command.action === 'send') {
      const { error } = await createEmailClient().auth.signInWithOtp({
        email: identity.user.email,
        options: { shouldCreateUser: false },
      })
      if (error)
        return NextResponse.json(
          { error: 'Unable to send a code. Please wait before trying again.' },
          { status: 400, headers },
        )
      return NextResponse.json(
        { message: 'Verification code sent to your current email.' },
        { headers },
      )
    }
    const admin = storageAdmin(10000)
    if (command.action === 'cancel') {
      const { error } = await admin.rpc('cancel_email_change', { user_id: identity.user.id })
      if (error) throw error
      return NextResponse.json({ message: 'Email change cancelled.' }, { headers })
    }
    const email = command.email.toLowerCase()
    if (email === identity.user.email.toLowerCase())
      return NextResponse.json(
        { error: 'Choose a different email address.' },
        { status: 400, headers },
      )
    // This stateless verifier never replaces the current browser's SSR session.
    const verifier = createEmailClient()
    const verified = await verifier.auth.verifyOtp({
      email: identity.user.email,
      token: command.code,
      type: 'email',
    })
    if (
      verified.error ||
      !verified.data.session ||
      verified.data.user?.id !== identity.user.id ||
      verified.data.user?.email?.toLowerCase() !== identity.user.email.toLowerCase()
    ) {
      if (verified.data.session) await verifier.auth.signOut({ scope: 'local' })
      return NextResponse.json(
        { error: 'The verification code is invalid or expired.' },
        { status: 400, headers },
      )
    }
    const signedOut = await verifier.auth.signOut({ scope: 'local' })
    if (signedOut.error) throw signedOut.error
    const quota = await identity.client.rpc('email_change_quota', { operation: 'change' })
    if (quota.error)
      return NextResponse.json(
        { error: 'Too many email changes. Try again later.' },
        { status: 429, headers },
      )
    const permission = await admin.rpc('authorize_email_change', {
      user_id: identity.user.id,
      new_email: email,
    })
    if (permission.error)
      return NextResponse.json(
        { error: 'Unable to start this change. Check for a pending request or try again later.' },
        { status: 400, headers },
      )
    const updated = await identity.client.auth.updateUser(
      { email },
      { emailRedirectTo: `${request.nextUrl.origin}/auth/confirm` },
    )
    if (updated.error)
      return NextResponse.json(
        {
          error:
            'Unable to request this email change. The address may be unavailable or email delivery may be limited.',
        },
        { status: 400, headers },
      )
    return NextResponse.json(
      {
        pendingEmail: email,
        message: 'Confirm the links sent to both your current and new email addresses.',
      },
      { headers },
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to update email settings. Please try again.' },
      { status: error instanceof RequestBodyTooLarge ? 413 : 400, headers },
    )
  }
}
