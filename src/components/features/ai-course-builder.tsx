'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { CheckCircle2, AlertCircle, Loader2, ChevronDown } from 'lucide-react'
import { useLms } from '@/lib/lms/store'
import { aiOutlineSchema, aiSpecSchema, type AiJob, type AiOutline } from '@/lib/lms/ai-course'
import type { Role } from '@/types'
import {
  FeatureShell,
  Heading,
  Panel,
  Back,
  Field,
  inputClass,
  primaryClass,
  secondaryClass,
} from './common'
const activeStatuses = ['outline_queued', 'outlining', 'generating']
const labels: Record<AiJob['status'], string> = {
  outline_queued: 'Queued',
  outlining: 'Preparing outline',
  review: 'Review outline',
  generating: 'Writing lessons',
  failed: 'Needs attention',
  complete: 'Draft ready',
  cancelled: 'Cancelled',
}
export function AiCourseBuilder({ role }: { role: Role }) {
  const { state, user, invalidateCaches, notice } = useLms()
  const [jobs, setJobs] = useState<AiJob[]>([]),
    [available, setAvailable] = useState(false),
    [checking, setChecking] = useState(true)
  const [title, setTitle] = useState(''),
    [audience, setAudience] = useState(''),
    [goals, setGoals] = useState(''),
    [level, setLevel] = useState('Beginner')
  const [category, setCategory] = useState(state.categories[0] || ''),
    [tutorId, setTutorId] = useState(
      role === 'tutor'
        ? user.id
        : state.users.find((u) => u.role === 'tutor' && u.isActive)?.id || '',
    )
  const [moduleCount, setModuleCount] = useState(3),
    [lessonsPerModule, setLessonsPerModule] = useState(3),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('')
  const [requestId, setRequestId] = useState(() => crypto.randomUUID())
  const [statusError, setStatusError] = useState('')
  const [sessionExpired, setSessionExpired] = useState(false)
  const [selectedId, setSelectedId] = useState<string | null>(() =>
    typeof window === 'undefined' ? null : new URLSearchParams(window.location.search).get('job'),
  )
  const [startNew, setStartNew] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const statusPanel = useRef<HTMLDivElement>(null)
  const focusStatus = useRef(false)
  const locked = useRef(false),
    loading = useRef(false),
    alive = useRef(true)
  const latest = useRef(jobs)
  const readVersion = useRef(0)
  const readController = useRef<AbortController | null>(null)
  latest.current = jobs
  useEffect(() => {
    if (!category && state.categories[0]) setCategory(state.categories[0])
    if (role === 'admin' && !tutorId) {
      const tutor = state.users.find((u) => u.role === 'tutor' && u.isActive)
      if (tutor) setTutorId(tutor.id)
    }
  }, [category, tutorId, role, state.categories, state.users])
  async function refresh() {
    if (loading.current || !alive.current) return
    loading.current = true
    const version = ++readVersion.current
    const controller = new AbortController()
    readController.current = controller
    try {
      const response = await fetch('/api/ai-courses', {
          cache: 'no-store',
          signal: controller.signal,
        }),
        data = await response.json()
      if (!response.ok) {
        if (alive.current && version === readVersion.current)
          setSessionExpired(response.status === 401)
        throw new Error(data.error || 'Unable to load AI courses.')
      }
      if (alive.current && version === readVersion.current) {
        setStatusError('')
        setSessionExpired(false)
        const finished = (data.jobs as AiJob[]).find(
          (j) =>
            j.status === 'complete' &&
            latest.current.some((old) => old.id === j.id && old.status !== 'complete'),
        )
        if (finished) {
          invalidateCaches()
          notice(
            (finished.ready ?? 0) >= finished.total
              ? `${finished.spec.title}: course draft ready.`
              : `${finished.spec.title}: generation finished. Some lessons need review.`,
          )
        }
        setJobs(data.jobs)
        setAvailable(data.available)
        setChecking(false)
      }
    } catch (e) {
      if (alive.current && version === readVersion.current && !controller.signal.aborted) {
        setStatusError(e instanceof Error ? e.message : 'Unable to load AI courses.')
        setChecking(false)
      }
    } finally {
      if (version === readVersion.current) loading.current = false
    }
  }
  useEffect(() => {
    alive.current = true
    void refresh()
    const timer = setInterval(() => {
      if (
        document.visibilityState !== 'hidden' &&
        latest.current.some((j) => activeStatuses.includes(j.status))
      )
        void refresh()
    }, 5000)
    const visible = () => {
      if (document.visibilityState !== 'hidden') void refresh()
    }
    document.addEventListener('visibilitychange', visible)
    return () => {
      alive.current = false
      // Invalidate outstanding reads; this counter is intentionally read at cleanup time.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      readVersion.current++
      readController.current?.abort()
      loading.current = false
      clearInterval(timer)
      document.removeEventListener('visibilitychange', visible)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  async function command(
    action: 'create' | 'approve' | 'cancel' | 'retry',
    id: string,
    outline?: AiOutline,
  ) {
    if (locked.current) return
    locked.current = true
    readVersion.current++
    readController.current?.abort()
    loading.current = false
    setBusy(true)
    setError('')
    try {
      let payload: unknown = { action, id, outline }
      if (action === 'create') {
        const spec = aiSpecSchema.safeParse({
          title,
          audience,
          goals,
          level,
          category,
          tutorId,
          moduleCount,
          lessonsPerModule,
        })
        if (!spec.success)
          throw new Error(spec.error.issues[0]?.message || 'Complete the course requirements.')
        payload = { action, id, spec: spec.data }
      }
      const response = await fetch('/api/ai-courses', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }),
        data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to update generation.')
      if (!alive.current) return
      readVersion.current++
      readController.current?.abort()
      loading.current = false
      setJobs((previous) =>
        [data.job, ...previous.filter((j) => j.id !== data.job.id)].slice(0, 10),
      )
      if (action === 'approve') invalidateCaches()
      setSelectedId(data.job.id)
      setStartNew(false)
      focusStatus.current = true
      if (action === 'create') {
        setRequestId(crypto.randomUUID())
        setTitle('')
        setAudience('')
        setGoals('')
      }
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Unable to update generation.')
    } finally {
      locked.current = false
      if (alive.current) setBusy(false)
    }
  }
  const current = jobs.find((j) =>
    ['outline_queued', 'outlining', 'review', 'generating'].includes(j.status),
  )
  const featured =
    current || (!startNew ? jobs.find((j) => j.id === selectedId) || jobs[0] : undefined)
  const history = jobs.filter((j) => j.id !== featured?.id)
  useEffect(() => {
    if (focusStatus.current && featured) {
      focusStatus.current = false
      statusPanel.current?.scrollIntoView?.({
        block: 'start',
        behavior: window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      })
    }
  }, [featured])
  return (
    <FeatureShell role={role} title="Create with AI">
      <Back href={`/${role}/courses`} />
      <Heading title="Create with AI" description="Turn a topic into an editable course draft." />
      {(error || statusError) && (
        <p role="alert" className="mb-5 rounded-xl bg-rose-50 p-4 text-sm text-rose-700">
          {error || statusError}{' '}
          {sessionExpired ? (
            <Link
              className="underline"
              href={`/login?next=${encodeURIComponent(`/${role}/courses/ai`)}`}
            >
              Sign in again
            </Link>
          ) : (
            <button type="button" className="underline" onClick={() => void refresh()}>
              Refresh status
            </button>
          )}
        </p>
      )}
      {featured && (
        <div ref={statusPanel} className="scroll-mt-24 mb-6">
          <GenerationStatus
            job={featured}
            role={role}
            busy={busy}
            onApprove={(outline) => void command('approve', featured.id, outline)}
            onRetry={() => void command('retry', featured.id)}
            onCancel={() => void command('cancel', featured.id)}
            onDismiss={() => {
              setStartNew(true)
              setSelectedId(null)
              setHistoryOpen(false)
            }}
          />
        </div>
      )}
      {!featured && (
        <Panel>
          <form
            className="space-y-5"
            onSubmit={(e) => {
              e.preventDefault()
              void command('create', requestId)
            }}
          >
            <Field label="Course title">
              <input
                className={inputClass}
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={160}
                required
                placeholder="e.g. Cybersecurity fundamentals"
              />
            </Field>
            <div className="grid md:grid-cols-2 gap-5">
              <Field label="Target audience">
                <input
                  className={inputClass}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  maxLength={500}
                  placeholder="e.g. New IT professionals"
                />
              </Field>
              <Field label="Level">
                <select
                  className={inputClass}
                  value={level}
                  onChange={(e) => setLevel(e.target.value)}
                >
                  {['Beginner', 'Intermediate', 'Advanced'].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              <Field label="Category">
                <select
                  className={inputClass}
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  required
                >
                  <option value="">Select category</option>
                  {category && !state.categories.includes(category) && (
                    <option value={category} disabled>
                      {category} (unavailable)
                    </option>
                  )}
                  {state.categories.map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </Field>
              {role === 'admin' && (
                <Field label="Instructor">
                  <select
                    className={inputClass}
                    value={tutorId}
                    onChange={(e) => setTutorId(e.target.value)}
                    required
                  >
                    <option value="">Select instructor</option>
                    {state.users
                      .filter((u) => u.role === 'tutor' && u.isActive)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
              <Field label="Modules">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={6}
                  value={moduleCount}
                  onChange={(e) => setModuleCount(Number(e.target.value))}
                />
              </Field>
              <Field label="Lessons per module">
                <input
                  className={inputClass}
                  type="number"
                  min={1}
                  max={4}
                  value={lessonsPerModule}
                  onChange={(e) => setLessonsPerModule(Number(e.target.value))}
                />
              </Field>
            </div>
            <Field label="Learning goals (optional)">
              <textarea
                className={inputClass}
                rows={3}
                value={goals}
                onChange={(e) => setGoals(e.target.value)}
                maxLength={1500}
                placeholder="What should learners be able to do?"
              />
            </Field>
            <button className={primaryClass} disabled={busy || checking || !available}>
              {busy ? 'Starting…' : 'Generate outline'}
            </button>
            {!checking && !available && !statusError && (
              <p className="text-sm text-slate-500">AI generation is not configured yet.</p>
            )}
            <p className="text-xs text-slate-500">
              AI content needs review before publication. Avoid confidential information.
            </p>
          </form>
        </Panel>
      )}
      {history.length > 0 && (
        <section className="mt-8 border-t border-slate-200 pt-5" aria-label="Recent generations">
          <button
            type="button"
            className="flex w-full items-center justify-between gap-3 text-sm font-medium text-slate-600"
            aria-expanded={historyOpen}
            aria-controls="generation-history"
            onClick={() => setHistoryOpen(!historyOpen)}
          >
            Recent generations ({history.length})
            <ChevronDown
              aria-hidden="true"
              className={`h-4 w-4 transition-transform ${historyOpen ? 'rotate-180' : ''}`}
            />
          </button>
          {historyOpen && (
            <div id="generation-history" className="mt-3 divide-y divide-slate-100">
              {history.map((job) => (
                <div
                  key={job.id}
                  className="flex flex-wrap items-center justify-between gap-3 py-3"
                >
                  <button
                    type="button"
                    disabled={!!current}
                    className="min-w-0 text-left text-sm font-medium text-slate-800 hover:text-brand-600"
                    onClick={() => {
                      setSelectedId(job.id)
                      setStartNew(false)
                      focusStatus.current = true
                    }}
                  >
                    <span className="block break-words">{job.spec.title}</span>
                    <span className="mt-1 block text-xs font-normal text-slate-500">
                      {labels[job.status]}
                    </span>
                  </button>
                  {job.courseId && (
                    <Link
                      href={`/${role}/courses/${job.courseId}/edit`}
                      className="shrink-0 text-sm font-medium text-brand-600"
                    >
                      Open draft
                    </Link>
                  )}
                </div>
              ))}
              <p className="pt-3 text-xs text-slate-400">
                Most recent 10 requests. Saved drafts are in My Courses.
              </p>
            </div>
          )}
        </section>
      )}
    </FeatureShell>
  )
}
function GenerationStatus({
  job,
  role,
  busy,
  onApprove,
  onRetry,
  onCancel,
  onDismiss,
}: {
  job: AiJob
  role: Role
  busy: boolean
  onApprove: (outline: AiOutline) => void
  onRetry: () => void
  onCancel: () => void
  onDismiss: () => void
}) {
  const complete = job.status === 'complete'
  const ready = job.ready ?? 0
  const allReady = complete && ready >= job.total && job.total > 0
  const failed = job.status === 'failed'
  const terminal = complete || failed || job.status === 'cancelled'
  const Icon = allReady || job.status === 'review' ? CheckCircle2 : terminal ? AlertCircle : Loader2
  const title = complete
    ? allReady
      ? 'Your course draft is ready'
      : 'Generation finished — review needed'
    : job.status === 'review'
      ? 'Your outline is ready'
      : failed
        ? 'Generation needs attention'
        : job.status === 'cancelled'
          ? 'Generation cancelled'
          : job.courseId
            ? 'Preparing your lessons'
            : 'Preparing your course outline'
  return (
    <Panel className={allReady ? 'border-emerald-200 bg-emerald-50/40' : ''}>
      <div
        className="flex items-start gap-3 mb-5"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        <Icon
          aria-hidden="true"
          className={`mt-0.5 h-6 w-6 shrink-0 ${allReady ? 'text-emerald-600' : complete || failed ? 'text-amber-600' : terminal || job.status === 'review' ? 'text-slate-400' : 'text-brand-600 animate-spin motion-reduce:animate-none'}`}
        />
        <div className="min-w-0">
          <h3 className="text-lg font-semibold text-navy">{title}</h3>
          <p className="mt-1 break-words text-sm text-slate-600">{job.spec.title}</p>
          {complete && (
            <p className="mt-2 text-sm text-slate-600">
              {allReady
                ? `${job.outline?.modules.length || 0} modules · All ${job.total} lessons ready for review.`
                : `${ready} of ${job.total} planned lessons have content. Check changed or removed lessons in the draft.`}
            </p>
          )}
        </div>
      </div>
      {!terminal && (
        <ol
          aria-label="Generation stages"
          className="mb-6 flex flex-wrap gap-x-6 gap-y-2 text-xs font-medium text-slate-500"
        >
          <li className="text-brand-600">
            1. Outline {job.courseId || job.status === 'review' ? '✓' : ''}
          </li>
          <li className={job.courseId ? 'text-brand-600' : ''}>2. Lessons</li>
          <li>3. Draft ready</li>
        </ol>
      )}
      {job.status === 'review' && job.outline ? (
        <OutlineReview key={job.id} outline={job.outline} busy={busy} onApprove={onApprove} />
      ) : null}
      {job.status === 'generating' && (
        <div className="space-y-3 mb-5">
          <div className="flex justify-between gap-3 text-sm text-slate-600">
            <span>
              {job.completed} of {job.total} lessons prepared
            </span>
            <span>{Math.round((job.completed / Math.max(job.total, 1)) * 100)}%</span>
          </div>
          <div
            role="progressbar"
            aria-label="Lesson generation"
            aria-valuemin={0}
            aria-valuemax={job.total}
            aria-valuenow={job.completed}
            className="h-2 overflow-hidden rounded-full bg-slate-100"
          >
            <div
              className="h-full bg-brand-600 transition-all motion-reduce:transition-none"
              style={{ width: `${Math.min(100, (job.completed / Math.max(job.total, 1)) * 100)}%` }}
            />
          </div>
        </div>
      )}
      {activeStatuses.includes(job.status) && (
        <p className="mb-5 text-sm text-slate-500">
          You can leave this page. We&apos;ll notify you when it&apos;s ready.
        </p>
      )}
      {job.error && !complete && (
        <p role="alert" className="mb-5 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
          {job.error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        {job.courseId && (
          <Link
            href={`/${role}/courses/${job.courseId}/edit`}
            className={complete ? primaryClass : secondaryClass}
          >
            {complete ? 'Review course draft' : 'Open saved draft'}
          </Link>
        )}
        {failed && (
          <button disabled={busy} className={primaryClass} onClick={onRetry}>
            Retry generation
          </button>
        )}
        {!terminal && (
          <button
            disabled={busy}
            className="text-sm text-slate-500 hover:text-rose-600"
            onClick={onCancel}
          >
            Cancel generation
          </button>
        )}
        {terminal && (
          <button disabled={busy} className={secondaryClass} onClick={onDismiss}>
            Create another course
          </button>
        )}
      </div>
    </Panel>
  )
}
function OutlineReview({
  outline,
  busy,
  onApprove,
}: {
  outline: AiOutline
  busy: boolean
  onApprove: (value: AiOutline) => void
}) {
  const [draft, setDraft] = useState(outline),
    [error, setError] = useState('')
  return (
    <form
      className="space-y-5"
      onSubmit={(e) => {
        e.preventDefault()
        const parsed = aiOutlineSchema.safeParse(draft)
        if (!parsed.success) {
          setError(parsed.error.issues[0]?.message || 'Complete the outline.')
          return
        }
        setError('')
        onApprove(parsed.data)
      }}
    >
      <Field label="Course description">
        <textarea
          rows={4}
          className={inputClass}
          value={draft.description}
          onChange={(e) => setDraft({ ...draft, description: e.target.value })}
          maxLength={10000}
        />
      </Field>
      <div className="space-y-2">
        <h4 className="text-sm font-medium">Learning objectives</h4>
        {draft.objectives.map((x, i) => (
          <input
            key={i}
            aria-label={`Objective ${i + 1}`}
            className={inputClass}
            value={x}
            maxLength={500}
            onChange={(e) =>
              setDraft({
                ...draft,
                objectives: draft.objectives.map((v, n) => (n === i ? e.target.value : v)),
              })
            }
          />
        ))}
      </div>
      <div className="grid lg:grid-cols-2 gap-5">
        {draft.modules.map((m, i) => (
          <div key={i} className="rounded-xl border border-slate-200 p-4 space-y-3">
            <Field label={`Module ${i + 1}`}>
              <input
                className={`${inputClass} font-semibold`}
                value={m.title}
                maxLength={200}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    modules: draft.modules.map((v, n) =>
                      n === i ? { ...v, title: e.target.value } : v,
                    ),
                  })
                }
              />
            </Field>
            {m.lessons.map((l, n) => (
              <input
                key={n}
                aria-label={`Module ${i + 1} lesson ${n + 1}`}
                className={inputClass}
                value={l}
                maxLength={200}
                onChange={(e) =>
                  setDraft({
                    ...draft,
                    modules: draft.modules.map((v, k) =>
                      k === i
                        ? { ...v, lessons: v.lessons.map((x, j) => (j === n ? e.target.value : x)) }
                        : v,
                    ),
                  })
                }
              />
            ))}
          </div>
        ))}
      </div>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      <button disabled={busy} className={primaryClass}>
        {busy ? 'Starting…' : 'Approve outline & generate lessons'}
      </button>
    </form>
  )
}
