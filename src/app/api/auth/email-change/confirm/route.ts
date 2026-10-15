import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createEmailClient } from '@/lib/supabase/email-client'
import { readBoundedText, RequestBodyTooLarge } from '@/lib/server/request-body'
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers })
  try {
    const input = z
      .object({
        token_hash: z
          .string()
          .min(20)
          .max(256)
          .regex(/^[a-zA-Z0-9_-]+$/),
      })
      .strict()
      .safeParse(JSON.parse(await readBoundedText(request, 2048)))
    if (!input.success)
      return NextResponse.json({ error: 'Invalid email-change link.' }, { status: 400, headers })
    const verifier = createEmailClient()
    const { data, error } = await verifier.auth.verifyOtp({ ...input.data, type: 'email_change' })
    if (error)
      return NextResponse.json(
        {
          error:
            'This link expired or was already used. Check both inboxes or return to email settings.',
        },
        { status: 400, headers },
      )
    if (!data.session)
      return NextResponse.json(
        {
          complete: false,
          message:
            'This address is confirmed. Confirm the link sent to the other address to finish.',
        },
        { headers },
      )
    const signedOut = await verifier.auth.signOut({ scope: 'global' })
    if (signedOut.error)
      return NextResponse.json(
        {
          complete: true,
          message: 'Email updated. Previous sessions were revoked. Sign in with your new email.',
        },
        { headers },
      )
    return NextResponse.json(
      { complete: true, message: 'Email updated. Sign in again with your new email address.' },
      { headers },
    )
  } catch (error) {
    return NextResponse.json(
      { error: 'Unable to verify this email change.' },
      { status: error instanceof RequestBodyTooLarge ? 413 : 400, headers },
    )
  }
}
