'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
import { createEmailClient } from '@/lib/supabase/email-client'
import { BrandLogo } from '@/components/shared/BrandLogo'
export function EmailSessionConfirm({ invitation = false }: { invitation?: boolean }) {
  const originalLink = useRef<{
    access_token: string
    refresh_token: string
    passwordFlow: boolean
  } | null>(null)
  const confirming = useRef(false)
  const credentials = useRef<{
    access_token: string
    refresh_token: string
    userId: string
    passwordFlow: boolean
  } | null>(null)
  const [email, setEmail] = useState('')
  const [error, setError] = useState('')
  const [checking, setChecking] = useState(true)
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    if (!originalLink.current) {
      const fragment = new URLSearchParams(window.location.hash.slice(1))
      window.history.replaceState(null, '', window.location.pathname)
      originalLink.current = {
        access_token: fragment.get('access_token') || '',
        refresh_token: fragment.get('refresh_token') || '',
        passwordFlow: invitation || ['recovery', 'invite'].includes(fragment.get('type') || ''),
      }
    }
    const { access_token, refresh_token, passwordFlow } = originalLink.current
    let active = true
    async function inspect() {
      if (
        !access_token ||
        !refresh_token ||
        access_token.length > 8192 ||
        refresh_token.length > 1024
      )
        throw new Error('This link is incomplete or expired. Request a new email link.')
      const { data, error } = await createClient().auth.getUser(access_token)
      if (error || !data.user?.email)
        throw new Error('This link could not be verified. Request a new email link.')
      if (active) {
        credentials.current = { access_token, refresh_token, userId: data.user.id, passwordFlow }
        setEmail(data.user.email)
      }
    }
    inspect()
      .catch((e) => {
        if (active) setError(e.message)
      })
      .finally(() => {
        if (active) setChecking(false)
      })
    return () => {
      active = false
    }
  }, [invitation])
  async function confirm() {
    const pending = credentials.current
    if (!pending || confirming.current) return
    confirming.current = true
    setBusy(true)
    setError('')
    try {
      // Verify the refresh credential belongs to the displayed account before persisting cookies.
      const refreshed = await createEmailClient().auth.refreshSession({
        refresh_token: pending.refresh_token,
      })
      if (refreshed.error || !refreshed.data.session || refreshed.data.user?.id !== pending.userId)
        throw new Error('Sign-in could not be completed. Request a new email link.')
      const { data, error } = await createClient().auth.setSession(refreshed.data.session)
      if (error || !data.session || data.user?.id !== pending.userId)
        throw new Error('Sign-in could not be completed. Request a new email link.')
      credentials.current = null
      window.location.replace(pending.passwordFlow ? '/reset-password' : '/api/auth/destination')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to finish signing in.')
      setBusy(false)
      confirming.current = false
    }
  }
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full shadow-sm">
        <BrandLogo className="h-12 mb-6" />
        <h1 className="text-2xl font-semibold">
          {invitation ? 'Accept your invitation' : 'Confirm your account'}
        </h1>
        {checking && (
          <p role="status" className="mt-4 text-sm text-slate-500">
            Checking your email link…
          </p>
        )}
        {email && (
          <>
            <p className="mt-4 text-sm text-slate-600">
              This link signs you in as <strong className="break-all">{email}</strong>. Continue
              only if this is your account.
            </p>
            <button
              type="button"
              disabled={busy}
              onClick={() => void confirm()}
              className="mt-6 w-full rounded-xl bg-brand-600 p-3 text-white font-semibold disabled:opacity-50"
            >
              {busy ? 'Signing in…' : 'Continue with this account'}
            </button>
          </>
        )}
        {error && (
          <p role="alert" className="mt-4 text-sm text-rose-600">
            {error}
          </p>
        )}
        <Link href="/login" className="block mt-5 text-sm text-brand-600">
          Back to sign in
        </Link>
        {error && (
          <Link href="/login?mode=confirm" className="block mt-4 text-sm text-slate-500">
            Request a new confirmation email
          </Link>
        )}
        {error && (
          <Link href="/login?mode=reset" className="block mt-4 text-sm text-slate-500">
            Request a new password reset email
          </Link>
        )}
      </section>
    </main>
  )
}
