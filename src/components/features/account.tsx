'use client'
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { Bell, Check } from 'lucide-react'
import { useLms } from '@/lib/lms/store'
import {
  FeatureShell,
  Heading,
  Panel,
  Empty,
  Field,
  inputClass,
  primaryClass,
  secondaryClass,
} from './common'
import type { Role, Notification } from '@/types'
import { SupportInbox } from './support-inbox'
import { BRAND_NAME } from '@/lib/brand'
import { EmailChangeSettings } from './email-change-settings'
import { prepareCompletionSound, playCompletionSound } from '@/lib/lms/completion-sound'
export function Settings({ role }: { role: Role }) {
  const { state, mutate, notice, user: currentUser } = useLms()
  const user = state.users.find((u) => u.id === currentUser.id)!
  const [tab, setTab] = useState('Profile')
  const [name, setName] = useState(user.name)
  const [platformName, setPlatformName] = useState(
    String(state.preferences[user.id]?.platformName || state.platformName || BRAND_NAME),
  )
  const preferences: Record<string, string | boolean> = {
    emailUpdates: true,
    courseReminders: true,
    weeklyDigest: false,
    aiCompletionSound: false,
    platformName: state.platformName || BRAND_NAME,
    enrollmentOpen: true,
    certificateEnabled: true,
    ...state.preferences[user.id],
  }
  async function pref(key: string, value: string | boolean) {
    if (!(await mutate({ type: 'preferences', preferences: { ...preferences, [key]: value } })))
      return
  }
  return (
    <FeatureShell role={role} title="Settings">
      <Heading title="Account settings" />
      <div className="grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)] gap-6 items-start">
        <Panel className="h-fit">
          <div className="space-y-1">
            {['Profile', 'Notifications', ...(role === 'admin' ? ['Platform'] : [])].map((t) => (
              <button
                key={t}
                className={`w-full text-left px-4 py-3 rounded-xl text-sm font-medium ${tab === t ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}
                onClick={() => setTab(t)}
              >
                {t}
              </button>
            ))}
          </div>
        </Panel>
        <Panel className="min-w-0">
          {tab === 'Profile' ? (
            <div className="space-y-6">
              <form
                className="grid grid-cols-1 sm:grid-cols-2 gap-5"
                onSubmit={async (e) => {
                  e.preventDefault()
                  if (
                    !(await mutate({
                      type: 'profile',
                      user: { ...user, name: name.trim(), email: user.email },
                    }))
                  )
                    return
                  notice('Your profile has been updated.')
                }}
              >
                <h3 className="font-semibold text-lg sm:col-span-2">Personal details</h3>
                <div className="flex items-center gap-4 sm:col-span-2">
                  <div className="w-16 h-16 bg-brand-50 text-brand-600 rounded-2xl flex items-center justify-center text-xl font-bold">
                    {name
                      .split(' ')
                      .map((s) => s[0])
                      .slice(0, 2)
                      .join('')}
                  </div>
                  <div>
                    <p className="font-semibold text-sm">{user.name}</p>
                    <p className="text-xs text-slate-400 capitalize mt-1">{role} account</p>
                  </div>
                </div>
                <Field label="Full name">
                  <input
                    className={inputClass}
                    value={name}
                    required
                    maxLength={100}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Email address">
                  <input
                    className={inputClass}
                    value={user.email}
                    required
                    type="email"
                    readOnly
                    aria-describedby="account-email-help"
                  />
                </Field>
                <p id="account-email-help" className="text-xs text-slate-400 sm:col-span-2">
                  Use the verified email-change flow below to update your sign-in address.
                </p>
                <button className={`${primaryClass} justify-self-start`} type="submit">
                  Save changes
                </button>
              </form>
              <EmailChangeSettings />
            </div>
          ) : tab === 'Notifications' ? (
            <>
              <h3 className="font-semibold text-lg mb-2">Notification preferences</h3>
              <p className="text-sm text-slate-500 mb-6">Choose which updates you receive.</p>
              {[
                {
                  key: 'emailUpdates',
                  label: 'Course announcements',
                  description: 'Updates from your courses and instructors.',
                },
                {
                  key: 'courseReminders',
                  label: 'Learning reminders',
                  description: 'Reminders for unfinished courses.',
                },
                {
                  key: 'weeklyDigest',
                  label: 'Weekly summary',
                  description: 'Your progress and activity in one place.',
                },
                ...(role !== 'learner'
                  ? [
                      {
                        key: 'aiCompletionSound',
                        label: 'AI course completion sound',
                        description:
                          'A gentle chime when your course draft is ready in an open dashboard.',
                      },
                    ]
                  : []),
              ].map((p) => (
                <label
                  key={p.key}
                  className="flex justify-between items-center gap-4 border-t border-slate-100 py-5 cursor-pointer"
                >
                  <div>
                    <p className="font-medium text-sm">{p.label}</p>
                    <p className="text-xs text-slate-400 mt-1">{p.description}</p>
                  </div>
                  <input
                    type="checkbox"
                    className="w-5 h-5 accent-brand-600"
                    checked={Boolean(preferences[p.key])}
                    onChange={(e) => {
                      if (p.key === 'aiCompletionSound' && e.target.checked)
                        prepareCompletionSound()
                      void pref(p.key, e.target.checked)
                    }}
                  />
                </label>
              ))}
              {role !== 'learner' && preferences.aiCompletionSound === true && (
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={async () => {
                    await prepareCompletionSound()
                    playCompletionSound()
                  }}
                >
                  Preview sound
                </button>
              )}
            </>
          ) : (
            <div className="space-y-5">
              <h3 className="font-semibold text-lg">Platform preferences</h3>
              <Field label="Platform display name">
                <input
                  className={inputClass}
                  value={platformName}
                  onChange={(e) => setPlatformName(e.target.value)}
                />
              </Field>
              {[
                { key: 'enrollmentOpen', label: 'Allow new enrollments' },
                { key: 'certificateEnabled', label: 'Issue completion certificates' },
              ].map((p) => (
                <label
                  key={p.key}
                  className="flex items-center justify-between text-sm border-t border-slate-100 py-4"
                >
                  {p.label}
                  <input
                    type="checkbox"
                    checked={Boolean(preferences[p.key])}
                    onChange={(e) => pref(p.key, e.target.checked)}
                  />
                </label>
              ))}
              <button
                className={primaryClass}
                onClick={async () => {
                  if (
                    await mutate({
                      type: 'preferences',
                      preferences: { ...preferences, platformName },
                    })
                  )
                    notice('Platform preferences saved.')
                }}
              >
                Save preferences
              </button>
              <CategoryManager />
            </div>
          )}
        </Panel>
      </div>
    </FeatureShell>
  )
}
function CategoryManager() {
  const { state, mutate, notice } = useLms()
  const [name, setName] = useState('')
  return (
    <div className="border-t pt-5 space-y-3">
      <h3 className="font-semibold">Course categories</h3>
      <div className="flex flex-wrap gap-2">
        {state.categories.map((c) => (
          <span key={c} className="rounded-full bg-slate-50 px-3 py-1 text-sm text-slate-600">
            {c}
          </span>
        ))}
      </div>
      <form
        className="flex gap-3"
        onSubmit={async (e) => {
          e.preventDefault()
          if (await mutate({ type: 'category', name: name.trim() })) {
            setName('')
            notice('Category added.')
          }
        }}
      >
        <input
          aria-label="New category"
          placeholder="Add a category"
          required
          maxLength={80}
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={inputClass}
        />
        <button className={secondaryClass}>Add</button>
      </form>
    </div>
  )
}
export function Notifications({ role }: { role: Role }) {
  const { state, mutate } = useLms()
  const [unread, setUnread] = useState(false)
  const [notes, setNotes] = useState<Notification[]>([])
  const [more, setMore] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [marking, setMarking] = useState(false)
  const [retry, setRetry] = useState(0)
  const feedVersion = useRef(0)
  useEffect(() => {
    feedVersion.current++
    const controller = new AbortController()
    setLoading(true)
    fetch(`/api/notifications?unread=${unread}`, { cache: 'no-store', signal: controller.signal })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load notifications')
        setNotes(data.notifications)
        setMore(data.hasMore)
        setError('')
      })
      .catch((e) => {
        if (!controller.signal.aborted) setError(e.message)
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [unread, state.notifications, retry])
  async function mark(id: string | null) {
    setMarking(true)
    try {
      await mutate({ type: 'readNotification', id })
    } finally {
      setMarking(false)
    }
  }
  async function older() {
    const last = notes.at(-1)
    if (!last || loading) return
    const version = feedVersion.current
    setLoading(true)
    try {
      const params = new URLSearchParams({
        unread: String(unread),
        beforeTime: last.createdAt,
        beforeId: last.id,
      })
      const response = await fetch(`/api/notifications?${params}`, { cache: 'no-store' })
      const data = await response.json()
      if (version !== feedVersion.current) return
      if (!response.ok) throw new Error(data.error || 'Unable to load notifications')
      setNotes((current) => [
        ...new Map([...current, ...data.notifications].map((n) => [n.id, n])).values(),
      ])
      setMore(data.hasMore)
      setError('')
    } catch (e) {
      if (version === feedVersion.current)
        setError(e instanceof Error ? e.message : 'Unable to load notifications')
    } finally {
      if (version === feedVersion.current) setLoading(false)
    }
  }
  return (
    <FeatureShell role={role} title="Notifications">
      <Heading title="Your notifications">
        <button
          className={secondaryClass}
          disabled={marking || !state.unreadNotifications}
          onClick={() => void mark(null)}
        >
          <Check className="w-4 h-4" />
          Mark all as read
        </button>
      </Heading>
      <div className="flex gap-2 mb-5">
        {['All', 'Unread'].map((t) => (
          <button
            className={!unread === (t === 'All') ? primaryClass : secondaryClass}
            onClick={() => setUnread(t === 'Unread')}
            key={t}
          >
            {t}
          </button>
        ))}
      </div>
      {notes.length ? (
        <Panel>
          {notes.map((n) => (
            <div className="flex gap-4 py-5 border-b border-slate-100 last:border-0" key={n.id}>
              <div
                className={`rounded-xl p-3 h-fit ${n.isRead ? 'bg-slate-50 text-slate-400' : 'bg-brand-50 text-brand-500'}`}
              >
                <Bell className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-sm">
                  {n.href?.startsWith(`/${role}`) ? (
                    <Link
                      href={n.href}
                      onClick={() => {
                        if (!n.isRead) void mark(n.id)
                      }}
                      className="hover:text-brand-600 hover:underline"
                    >
                      {n.title}
                    </Link>
                  ) : (
                    n.title
                  )}
                </h3>
                <p className="text-sm text-slate-500 mt-1">{n.message}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {new Date(n.createdAt).toLocaleDateString()}
                </p>
              </div>
              {!n.isRead && (
                <button
                  className="text-brand-600 text-xs font-semibold"
                  disabled={marking}
                  onClick={() => void mark(n.id)}
                >
                  Mark read
                </button>
              )}
            </div>
          ))}
        </Panel>
      ) : !loading && !error ? (
        <Empty title="All caught up" description="You have no notifications to review." />
      ) : null}
      {loading && (
        <p role="status" className="mt-4 text-sm text-slate-500">
          Loading notifications…
        </p>
      )}
      {error && (
        <p role="alert" className="mt-4 text-sm text-rose-600">
          {error}{' '}
          <button onClick={() => setRetry((n) => n + 1)} className="underline">
            Retry
          </button>
        </p>
      )}
      {more && (
        <button
          className={`${secondaryClass} mt-4`}
          disabled={loading}
          onClick={() => void older()}
        >
          Load older notifications
        </button>
      )}
    </FeatureShell>
  )
}
export function Help({ role }: { role: Role }) {
  const { notice, execute } = useLms()
  const [submitted, setSubmitted] = useState(false)
  const faqs = [
    [
      'How do I enroll in a course?',
      'Open Browse Catalog, choose a course, and select Enroll in course. Free courses appear in My Courses immediately. Paid courses require verified payment.',
    ],
    [
      'How do certificates work?',
      'Complete every lesson and pass the final assessment. Your certificate will appear in Certificates, where you can view, download, or print it.',
    ],
    [
      'Where is my progress saved?',
      'Your progress and notes are saved to your account. Sign in on another device to continue learning.',
    ],
    [
      'How do I create a course?',
      'In Tutor Studio, open Create Course. Add a title, description, modules, and lessons. Save a draft, then publish from the course overview.',
    ],
    [
      'Can I switch between roles?',
      'An administrator assigns tutor and administrator access. Your account opens the workspace for your assigned role.',
    ],
  ]
  return (
    <FeatureShell role={role} title="Help center">
      <Heading title="Help center" />
      <div className="grid lg:grid-cols-3 gap-6">
        <Panel className="lg:col-span-2">
          <h3 className="font-semibold mb-5">Frequently asked questions</h3>
          {faqs.map(([q, a]) => (
            <details key={q} className="border-t border-slate-100 py-5">
              <summary className="cursor-pointer font-medium text-sm">{q}</summary>
              <p className="text-sm text-slate-500 leading-6 mt-3">{a}</p>
            </details>
          ))}
        </Panel>
        <Panel className="h-fit">
          <h3 className="font-semibold mb-3">Contact support</h3>
          {submitted ? (
            <>
              <p className="text-sm text-emerald-600 mb-4">
                Your support request has been saved for administrator review.
              </p>
              <button className={secondaryClass} onClick={() => setSubmitted(false)}>
                Ask another question
              </button>
            </>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                const form = new FormData(e.currentTarget)
                try {
                  await execute({
                    type: 'support',
                    subject: String(form.get('subject')),
                    message: String(form.get('message')),
                  })
                  setSubmitted(true)
                  notice('Support request saved.')
                } catch (error) {
                  notice(error instanceof Error ? error.message : 'Unable to save request')
                }
              }}
            >
              <Field label="Subject">
                <input name="subject" required maxLength={200} className={inputClass} />
              </Field>
              <Field label="Your question">
                <textarea
                  name="message"
                  required
                  maxLength={20000}
                  rows={5}
                  className={inputClass}
                />
              </Field>
              <button type="submit" className={`${primaryClass} w-full`}>
                Submit request
              </button>
            </form>
          )}
          <Link href={`/${role}/courses`} className="text-brand-600 text-sm block mt-5">
            Return to courses →
          </Link>
        </Panel>
      </div>
      {role === 'admin' && <SupportInbox />}
    </FeatureShell>
  )
}
