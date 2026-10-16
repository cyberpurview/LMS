'use client'
import { useEffect, useRef, useState } from 'react'
import { Field, inputClass, primaryClass, secondaryClass } from './common'
export function EmailChangeSettings() {
  const [pending, setPending] = useState<string | null>(null),
    [available, setAvailable] = useState(false),
    [google, setGoogle] = useState(false),
    [sent, setSent] = useState(false)
  const [email, setEmail] = useState(''),
    [code, setCode] = useState(''),
    [busy, setBusy] = useState(false),
    [checking, setChecking] = useState(true),
    [error, setError] = useState(''),
    [message, setMessage] = useState('')
  const submitting = useRef(false)
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/auth/email-change', { cache: 'no-store', signal: controller.signal })
      .then(async (r) => {
        const data = await r.json()
        if (!r.ok) throw new Error(data.error)
        if (!controller.signal.aborted) {
          setPending(data.pendingEmail)
          setAvailable(data.available === true)
          setGoogle(data.linkedGoogle)
        }
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setChecking(false)
      })
    return () => controller.abort()
  }, [])
  async function submit(action: 'send' | 'change' | 'cancel') {
    if (submitting.current) return
    submitting.current = true
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch('/api/auth/email-change', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(action === 'change' ? { action, email, code } : { action }),
      })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update email settings.')
      setMessage(data.message)
      if (action === 'send') setSent(true)
      if (action === 'change') {
        setPending(data.pendingEmail)
        setCode('')
        setEmail('')
        setSent(false)
      }
      if (action === 'cancel') {
        setPending(null)
        setCode('')
        setSent(false)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to update email settings.')
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  return (
    <section
      className="border-t border-slate-100 pt-6 space-y-4"
      aria-labelledby="change-email-heading"
    >
      <h3 id="change-email-heading" className="text-lg font-semibold">
        Change sign-in email
      </h3>
      {checking ? (
        <p role="status" className="text-sm text-slate-500">
          Loading email settings…
        </p>
      ) : pending ? (
        <>
          <p className="text-sm text-slate-600">
            Waiting for confirmation from both addresses. New email:{' '}
            <strong className="break-all">{pending}</strong>.
          </p>
          <p className="text-xs text-slate-500">
            Your current email stays active until both links are confirmed. You’ll then sign in
            again with the new address.
          </p>
          <button
            type="button"
            disabled={busy}
            className={secondaryClass}
            onClick={() => void submit('cancel')}
          >
            {busy ? 'Cancelling…' : 'Cancel email change'}
          </button>
        </>
      ) : !available ? (
        <p className="text-sm text-slate-500">
          Email changes are temporarily unavailable. Please contact support.
        </p>
      ) : (
        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault()
            void submit('change')
          }}
        >
          <p className="text-sm text-slate-500">
            Verify your current email first. Then confirm the links sent to both addresses. Your
            courses and certificates stay on this account.
          </p>
          <button
            type="button"
            className={secondaryClass}
            disabled={busy}
            onClick={() => void submit('send')}
          >
            {busy && !sent
              ? 'Sending…'
              : sent
                ? 'Resend verification code'
                : 'Send verification code'}
          </button>
          {sent && (
            <>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Code from your current email">
                  <input
                    className={inputClass}
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    pattern="[0-9]{6,10}"
                    maxLength={10}
                    required
                    disabled={busy}
                  />
                </Field>
                <Field label="New email address">
                  <input
                    className={inputClass}
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    maxLength={254}
                    autoComplete="email"
                    required
                    disabled={busy}
                  />
                </Field>
              </div>
              <button className={primaryClass} disabled={busy} type="submit">
                {busy ? 'Verifying…' : 'Verify & request email change'}
              </button>
            </>
          )}
        </form>
      )}
      {google && (
        <p className="text-xs text-slate-500">
          Your linked Google account remains a sign-in method. Changing this email does not unlink
          Google.
        </p>
      )}
      {message && (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
    </section>
  )
}
