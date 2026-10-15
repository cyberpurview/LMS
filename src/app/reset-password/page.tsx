'use client'
import { useState } from 'react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/client'
export default function ResetPassword() {
  const [password, setPassword] = useState(''),
    [message, setMessage] = useState(''),
    [busy, setBusy] = useState(false),
    [done, setDone] = useState(false),
    [nonce, setNonce] = useState(''),
    [needsCode, setNeedsCode] = useState(false),
    [needsSignOut, setNeedsSignOut] = useState(false)
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <form
        className="bg-white rounded-2xl p-8 border max-w-md w-full space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (busy || done) return
          if (password.length < 12) {
            setMessage('Use at least 12 characters.')
            return
          }
          setBusy(true)
          try {
            const client = createClient(),
              { data } = await client.auth.getUser()
            if (!data.user) throw new Error('Open the password reset link in your email first.')
            const { error } = await client.auth.updateUser({
              password,
              ...(nonce ? { nonce } : {}),
            })
            if (error) {
              if (
                error.code === 'reauthentication_needed' ||
                error.code === 'reauthentication_not_valid'
              )
                setNeedsCode(true)
              throw error
            }
            setPassword('')
            setNonce('')
            setDone(true)
            const signedOut = await client.auth.signOut({ scope: 'global' })
            setNeedsSignOut(!!signedOut.error)
            setMessage(
              signedOut.error
                ? 'Password updated. Session sign-out failed; retry below.'
                : 'Password updated. Sign in again with your new password.',
            )
          } catch (e) {
            setMessage(e instanceof Error ? e.message : 'Unable to reset password')
          } finally {
            setBusy(false)
          }
        }}
      >
        <h1 className="text-2xl font-semibold">Choose a new password</h1>
        <label className="block text-sm">
          New password
          <input
            required
            type="password"
            minLength={12}
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="block border rounded-xl p-3 w-full mt-2"
          />
        </label>
        {needsCode && !done && (
          <div className="space-y-3">
            <p className="text-sm text-slate-600">
              Verify your account before changing your password.
            </p>
            <button
              type="button"
              disabled={busy}
              className="text-sm text-brand-600"
              onClick={async () => {
                setBusy(true)
                try {
                  const { error } = await createClient().auth.reauthenticate()
                  if (error) throw error
                  setMessage('Check your account email for the verification code.')
                } catch (e) {
                  setMessage(e instanceof Error ? e.message : 'Unable to send verification code')
                } finally {
                  setBusy(false)
                }
              }}
            >
              Send verification code
            </button>
            <label className="block text-sm">
              Verification code
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={16}
                value={nonce}
                onChange={(e) => setNonce(e.target.value.trim())}
                className="block border rounded-xl p-3 w-full mt-2"
              />
            </label>
          </div>
        )}
        <button
          disabled={busy || done}
          className="bg-brand-600 text-white rounded-xl p-3 w-full disabled:opacity-50"
        >
          {busy ? 'Updating…' : 'Update password'}
        </button>
        {message && (
          <p role="status" className="text-sm">
            {message}
          </p>
        )}
        {needsSignOut && (
          <button
            type="button"
            disabled={busy}
            className="text-sm text-brand-600"
            onClick={async () => {
              setBusy(true)
              try {
                const { error } = await createClient().auth.signOut({ scope: 'global' })
                if (error) throw error
                setNeedsSignOut(false)
                setMessage('All sessions signed out. Sign in with your new password.')
              } catch (e) {
                setMessage(e instanceof Error ? e.message : 'Unable to sign out')
              } finally {
                setBusy(false)
              }
            }}
          >
            Retry session sign-out
          </button>
        )}
        <Link
          href={done ? '/login' : '/api/auth/destination'}
          className="block text-sm text-brand-600"
        >
          {done ? 'Sign in with your new password' : 'Back to your workspace'}
        </Link>
      </form>
    </main>
  )
}
