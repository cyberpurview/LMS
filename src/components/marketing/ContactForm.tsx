'use client'
import Link from 'next/link'
import { useRef, useState } from 'react'
import { CONTACT_SUBJECTS } from '@/lib/lms/contact'

export function ContactForm() {
  const startedAt = useRef(Date.now())
  const requestId = useRef<string | null>(null)
  const submitting = useRef(false)
  const [busy, setBusy] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting.current) return
    submitting.current = true
    const form = new FormData(event.currentTarget)
    requestId.current ||= crypto.randomUUID()
    setBusy(true)
    setError('')
    try {
      const response = await fetch('/api/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...Object.fromEntries(form),
          startedAt: startedAt.current,
          requestId: requestId.current,
        }),
        signal: AbortSignal.timeout(20000),
      })
      const result = await response.json()
      if (!response.ok)
        throw new Error(result.error || 'Unable to send your message. Please try again.')
      setSent(true)
    } catch (issue) {
      setError(
        issue instanceof Error && issue.name !== 'TimeoutError'
          ? issue.message
          : 'The request timed out. Please try again; your message is still here.',
      )
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }
  const field =
    'mt-2 block w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-base text-navy outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
  if (sent)
    return (
      <div role="status" className="rounded-2xl border border-slate-200 bg-white p-8">
        <h2 className="text-xl font-semibold">Message sent</h2>
        <p className="mt-3 leading-7 text-slate-600">
          Thank you for contacting CyberPurview. We’ll reply to the email address you provided.
        </p>
        <button
          type="button"
          onClick={() => {
            setSent(false)
            requestId.current = null
            startedAt.current = Date.now()
          }}
          className="mt-6 text-sm font-semibold text-brand-600"
        >
          Send another message
        </button>
      </div>
    )
  return (
    <form
      onSubmit={submit}
      onChange={() => {
        requestId.current = null
      }}
      className="rounded-2xl border border-slate-200 bg-white p-6 sm:p-8"
    >
      {error && (
        <p role="alert" className="mb-6 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          {error}
        </p>
      )}
      <fieldset disabled={busy} className="space-y-5 disabled:opacity-70">
        <label className="block text-sm font-medium">
          Name
          <input
            name="name"
            autoComplete="name"
            required
            minLength={2}
            maxLength={100}
            className={field}
          />
        </label>
        <label className="block text-sm font-medium">
          Email address
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            maxLength={254}
            className={field}
          />
        </label>
        <label className="block text-sm font-medium">
          Subject
          <select name="subject" className={field} defaultValue="Account help">
            {CONTACT_SUBJECTS.map((subject) => (
              <option key={subject}>{subject}</option>
            ))}
          </select>
        </label>
        <label className="block text-sm font-medium">
          Message
          <textarea
            name="message"
            required
            minLength={20}
            maxLength={5000}
            rows={6}
            className={field + ' resize-y'}
          />
        </label>
        <div className="hidden" aria-hidden="true">
          <label>
            Website
            <input name="website" tabIndex={-1} autoComplete="off" />
          </label>
        </div>
        <p className="text-xs leading-6 text-slate-500">
          We use your details to respond to your request. Please don’t include passwords or payment
          details.{' '}
          <Link href="/privacy" className="text-brand-600 underline underline-offset-2">
            Privacy Policy
          </Link>
        </p>
        <button
          type="submit"
          className="w-full rounded-xl bg-brand-600 px-5 py-3.5 font-semibold text-white hover:bg-brand-700 disabled:cursor-wait"
        >
          {busy ? 'Sending…' : 'Send message'}
        </button>
      </fieldset>
    </form>
  )
}
