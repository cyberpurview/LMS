'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { BrandLogo } from '@/components/shared/BrandLogo'

export default function ConfirmEmail() {
  const started = useRef(false)
  const [link, setLink] = useState<{ token_hash: string; type: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [complete, setComplete] = useState(false)
  const confirming = useRef(false)
  useEffect(() => {
    if (started.current) return
    started.current = true
    const params = new URLSearchParams(window.location.search)
    const token_hash = params.get('token_hash') || ''
    const type = params.get('type') || ''
    // Keep the one-time credential out of subsequent URLs and browser history.
    window.history.replaceState(null, '', window.location.pathname)
    if (token_hash && ['email', 'recovery', 'invite', 'email_change'].includes(type))
      setLink({ token_hash, type })
    else setError('This link is incomplete. Open the latest email or request a new link.')
  }, [])
  async function confirm() {
    if (!link || confirming.current) return
    confirming.current = true
    setBusy(true)
    setError('')
    try {
      const response = await fetch(
        link.type === 'email_change' ? '/api/auth/email-change/confirm' : '/api/auth/confirm',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(
            link.type === 'email_change' ? { token_hash: link.token_hash } : link,
          ),
        },
      )
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      if (link.type === 'email_change') {
        setMessage(result.message)
        setComplete(result.complete)
        setLink(null)
        setBusy(false)
      } else window.location.replace(result.destination)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to verify this link. Please try again.')
      setBusy(false)
      confirming.current = false
    }
  }
  const passwordFlow = link?.type === 'recovery' || link?.type === 'invite'
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <section className="bg-white rounded-3xl border border-slate-200 p-8 max-w-md w-full shadow-sm">
        <Link href="/" aria-label="CyberPurview home" className="inline-flex mb-6">
          <BrandLogo />
        </Link>
        <h1 className="text-2xl font-semibold text-navy">
          {link?.type === 'email_change' || message
            ? 'Confirm email change'
            : link?.type === 'invite'
              ? 'Accept your invitation'
              : passwordFlow
                ? 'Reset your password'
                : 'Confirm your email'}
        </h1>
        <p className="text-sm text-slate-500 mt-3 mb-6">
          {link?.type === 'email_change' || message
            ? 'Both email addresses must be confirmed before your sign-in email changes.'
            : passwordFlow
              ? 'Continue securely to choose your password.'
              : 'Confirm your email address to open your learning workspace.'}
        </p>
        {error && (
          <p role="alert" className="text-sm rounded-xl bg-rose-50 text-rose-700 p-4 mb-5">
            {error}
          </p>
        )}
        {message && (
          <p role="status" className="text-sm rounded-xl bg-emerald-50 text-emerald-800 p-4 mb-5">
            {message}
          </p>
        )}
        {link && (
          <button
            onClick={confirm}
            disabled={busy}
            className="w-full rounded-xl bg-brand-600 hover:bg-brand-700 text-white p-3.5 font-semibold disabled:opacity-50"
          >
            {busy ? 'Verifying…' : passwordFlow ? 'Continue' : 'Confirm email and continue'}
          </button>
        )}
        <Link href="/login" className="block text-center text-sm text-brand-600 mt-6">
          {complete ? 'Sign in with your new email' : 'Back to sign in'}
        </Link>
        {!message && link?.type !== 'email_change' && (
          <Link
            href="/login?mode=confirm"
            className="block text-center text-sm text-slate-500 mt-4"
          >
            Request a new confirmation email
          </Link>
        )}
      </section>
    </main>
  )
}
