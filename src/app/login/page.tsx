'use client'
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { ArrowRight, Eye, EyeOff } from 'lucide-react'
import { BrandLogo } from '@/components/shared/BrandLogo'
import { createClient } from '@/lib/supabase/client'
import { createEmailClient } from '@/lib/supabase/email-client'
import { googleOAuthOptions } from '@/lib/supabase/oauth'

export default function LoginPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset' | 'confirm'>('login')
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [visible, setVisible] = useState(false)
  const [loading, setLoading] = useState(false)
  const [googleLoading, setGoogleLoading] = useState(false)
  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    if (params.get('mode') === 'confirm') setMode('confirm')
    if (params.get('mode') === 'reset') setMode('reset')
    const issue = params.get('error')
    if (issue)
      setError(
        issue === 'setup'
          ? 'Apply the database migration before opening your workspace.'
          : issue === 'oauth_cancelled'
            ? 'Google sign-in was not approved. You can try again or sign in with your email.'
            : issue === 'oauth_provider'
              ? 'Google sign-in is currently unavailable. Please sign in with your email or contact support.'
              : issue === 'oauth_session'
                ? 'Google sign-in could not be completed. Please try again.'
                : 'This link could not finish signing you in. Your email may already be confirmed—try signing in with your password, or request a new confirmation email.',
      )
  }, [])
  async function signInWithGoogle() {
    if (loading) return
    setLoading(true)
    setGoogleLoading(true)
    setError('')
    setMessage('')
    try {
      const next = new URLSearchParams(window.location.search).get('next')
      const { data, error } = await createClient().auth.signInWithOAuth(
        googleOAuthOptions(window.location.origin, next),
      )
      if (error) throw error
      if (!data.url) throw new Error('Google sign-in is unavailable. Please try again.')
      window.location.assign(data.url)
    } catch (error) {
      setError(
        error instanceof Error ? error.message : 'Unable to connect to Google. Please try again.',
      )
      setLoading(false)
      setGoogleLoading(false)
    }
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault()
    if (loading) return
    setLoading(true)
    setError('')
    setMessage('')
    try {
      const client = mode === 'login' ? createClient() : createEmailClient()
      if (mode === 'confirm') {
        const { error } = await client.auth.resend({
          type: 'signup',
          email,
          options: { emailRedirectTo: `${window.location.origin}/auth/complete` },
        })
        if (error) throw error
        setMessage(
          'If this account needs confirmation, a new email has been sent. Use the latest link. If you already confirmed, sign in with your password.',
        )
      } else if (mode === 'reset') {
        const { error } = await client.auth.resetPasswordForEmail(email, {
          redirectTo: `${window.location.origin}/auth/complete?next=/reset-password`,
        })
        if (error) throw error
        setMessage('If an account exists for this address, you will receive a password reset link.')
      } else if (mode === 'signup') {
        const { data, error } = await client.auth.signUp({
          email,
          password,
          options: {
            data: { name: name.trim() },
            emailRedirectTo: `${window.location.origin}/auth/complete`,
          },
        })
        if (error) throw error
        if (data.session) {
          const { error } = await createClient().auth.setSession(data.session)
          if (error) throw error
          window.location.assign('/api/auth/destination')
        } else {
          setMode('confirm')
          setPassword('')
          setMessage(
            'Check your email and use the latest confirmation link to open your workspace.',
          )
        }
      } else {
        const { error } = await client.auth.signInWithPassword({ email, password })
        if (error) {
          if (error.code === 'email_not_confirmed') setMode('confirm')
          throw error
        }
        const requested = new URLSearchParams(window.location.search).get('next')
        const destination = new URL('/api/auth/destination', window.location.origin)
        if (requested && requested.length <= 2048) destination.searchParams.set('next', requested)
        window.location.assign(destination.pathname + destination.search)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to sign in. Please try again.')
    } finally {
      setLoading(false)
    }
  }
  return (
    <main className="flex min-h-[100dvh] items-center justify-center bg-[#f7f8fa] px-5 py-8 sm:py-12">
      <section className="w-full max-w-md">
        <Link href="/" aria-label="CyberPurview home" className="mb-6 flex justify-center">
          <BrandLogo />
        </Link>
        <div className="w-full max-w-md bg-white rounded-3xl border border-slate-200 p-6 sm:p-9 shadow-sm">
          <h1 className="text-2xl font-semibold text-navy">
            {mode === 'signup'
              ? 'Start your learning journey'
              : mode === 'reset'
                ? 'Reset your password'
                : mode === 'confirm'
                  ? 'Confirm your email'
                  : 'Welcome back'}
          </h1>
          <p className="text-sm text-slate-500 mt-2 mb-7">
            {mode === 'signup'
              ? 'Create your learner account. Tutors receive access from an administrator.'
              : mode === 'reset'
                ? 'We’ll send a link to your account email.'
                : mode === 'confirm'
                  ? 'Request a fresh link to verify your email address.'
                  : 'Sign in to your learning workspace.'}
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
          {(mode === 'login' || mode === 'signup') && (
            <>
              <button
                type="button"
                disabled={loading}
                onClick={signInWithGoogle}
                className="flex w-full items-center justify-center gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500 disabled:cursor-wait disabled:opacity-50"
              >
                <svg aria-hidden="true" width="20" height="20" viewBox="0 0 48 48">
                  <path
                    fill="#4285F4"
                    d="M43.61 24.46c0-1.36-.12-2.66-.35-3.92H24v7.42h11a9.4 9.4 0 0 1-4.08 6.16v5h6.6c3.86-3.56 6.09-8.8 6.09-14.66Z"
                  />
                  <path
                    fill="#34A853"
                    d="M24 44c5.5 0 10.1-1.82 13.47-4.88l-6.6-5c-1.82 1.22-4.15 1.94-6.87 1.94-5.31 0-9.81-3.59-11.41-8.42H5.77v5.16A20 20 0 0 0 24 44Z"
                  />
                  <path
                    fill="#FBBC05"
                    d="M12.59 27.64a12 12 0 0 1 0-7.28V15.2H5.77a20 20 0 0 0 0 17.6l6.82-5.16Z"
                  />
                  <path
                    fill="#EA4335"
                    d="M24 11.94c3 0 5.7 1.03 7.82 3.06l5.87-5.87A19.7 19.7 0 0 0 24 4 20 20 0 0 0 5.77 15.2l6.82 5.16C14.19 15.53 18.69 11.94 24 11.94Z"
                  />
                </svg>
                {googleLoading ? 'Connecting to Google…' : 'Continue with Google'}
              </button>
              <div className="my-6 flex items-center gap-4 text-xs text-slate-400">
                <span className="h-px flex-1 bg-slate-200" />
                or continue with email
                <span className="h-px flex-1 bg-slate-200" />
              </div>
            </>
          )}
          <form onSubmit={submit} className="space-y-5">
            {mode === 'signup' && (
              <label className="block text-sm font-medium">
                Full name
                <input
                  required
                  maxLength={100}
                  autoComplete="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-2 block w-full rounded-xl border p-3 outline-brand-500"
                />
              </label>
            )}
            <label className="block text-sm font-medium">
              Email address
              <input
                type="email"
                maxLength={254}
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="mt-2 block w-full rounded-xl border p-3 outline-brand-500"
              />
            </label>
            {(mode === 'login' || mode === 'signup') && (
              <label className="block text-sm font-medium">
                Password
                <div className="relative mt-2">
                  <input
                    type={visible ? 'text' : 'password'}
                    required
                    minLength={mode === 'signup' ? 12 : 1}
                    autoComplete={mode === 'signup' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="block w-full rounded-xl border p-3 pr-12 outline-brand-500"
                  />
                  <button
                    type="button"
                    aria-label={visible ? 'Hide password' : 'Show password'}
                    className="absolute right-3 top-3 text-slate-400"
                    onClick={() => setVisible(!visible)}
                  >
                    {visible ? <EyeOff size={20} /> : <Eye size={20} />}
                  </button>
                </div>
                {mode === 'signup' && (
                  <span className="block text-xs text-slate-400 mt-2">
                    Use at least 12 characters.
                  </span>
                )}
              </label>
            )}
            {mode === 'login' && (
              <button
                type="button"
                className="text-sm text-brand-600"
                onClick={() => {
                  setMode('reset')
                  setMessage('')
                  setError('')
                }}
              >
                Forgot password?
              </button>
            )}
            <button
              disabled={loading}
              className="w-full flex items-center justify-center gap-3 rounded-xl bg-brand-600 hover:bg-brand-700 text-white p-3.5 font-semibold disabled:opacity-50"
            >
              {loading
                ? 'Please wait…'
                : mode === 'signup'
                  ? 'Create account'
                  : mode === 'reset'
                    ? 'Send reset link'
                    : mode === 'confirm'
                      ? 'Resend confirmation email'
                      : 'Sign in'}
              <ArrowRight size={17} />
            </button>
          </form>
          {mode === 'login' && (
            <button
              type="button"
              className="block mx-auto mt-5 text-sm text-slate-500"
              onClick={() => {
                setMode('confirm')
                setMessage('')
                setError('')
              }}
            >
              Need a new confirmation email?
            </button>
          )}
          <button
            className="block mx-auto mt-6 text-sm text-brand-600"
            onClick={() => {
              setMode(mode === 'login' ? 'signup' : 'login')
              setMessage('')
              setError('')
            }}
          >
            {mode === 'login' ? 'New to CyberPurview? Create an account' : 'Back to sign in'}
          </button>
          <p className="mt-5 text-center text-xs leading-5 text-slate-500">
            {mode === 'signup' && 'By creating an account, you agree to our '}
            <Link href="/terms" className="underline underline-offset-2">
              Terms of Service
            </Link>
            {mode === 'signup' ? ' and acknowledge our ' : ' · '}
            <Link href="/privacy" className="underline underline-offset-2">
              Privacy Policy
            </Link>
            .
          </p>
          <Link href="/" className="block text-center text-xs text-slate-400 mt-5">
            ← Back to CyberPurview
          </Link>
        </div>
      </section>
    </main>
  )
}
