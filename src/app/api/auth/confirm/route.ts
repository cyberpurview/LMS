import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { readBoundedText, RequestBodyTooLarge } from '@/lib/server/request-body'

const input = z
  .object({
    token_hash: z
      .string()
      .min(20)
      .max(256)
      .regex(/^[a-zA-Z0-9_-]+$/),
    type: z.enum(['email', 'recovery', 'invite']),
  })
  .strict()
const headers = { 'Cache-Control': 'private, no-store', 'Referrer-Policy': 'no-referrer' }

// A POST after a deliberate click avoids consuming links during email previews.
export async function POST(request: NextRequest) {
  if (request.headers.get('origin') !== request.nextUrl.origin)
    return NextResponse.json({ error: 'Invalid request origin' }, { status: 403, headers })
  try {
    const raw = await readBoundedText(request, 2048)
    const parsed = input.safeParse(JSON.parse(raw))
    if (!parsed.success)
      return NextResponse.json(
        { error: 'This confirmation link is incomplete or invalid.' },
        { status: 400, headers },
      )
    const client = await createClient()
    const { data, error } = await client.auth.verifyOtp(parsed.data)
    if (error || !data.session)
      return NextResponse.json(
        {
          error:
            'This link has expired or was already used. If your email is confirmed, sign in with your password. Otherwise request a new link.',
        },
        { status: 400, headers },
      )
    return NextResponse.json(
      { destination: parsed.data.type === 'email' ? '/api/auth/destination' : '/reset-password' },
      { headers },
    )
  } catch (error) {
    if (error instanceof RequestBodyTooLarge)
      return NextResponse.json({ error: 'Request too large' }, { status: 413, headers })
    return NextResponse.json(
      { error: 'Unable to verify this link. Please try again or request a new one.' },
      { status: 400, headers },
    )
  }
}
