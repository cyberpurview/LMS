'use client'
import React, {
  createContext,
  useContext,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { emptyState, type LmsState } from './state'
import type { LmsCommand } from './commands'
import type { User } from '@/types'
import { DashboardLayout } from '@/components/shared/DashboardLayout'
import { DashboardContentSkeleton } from '@/components/shared/DashboardContentSkeleton'
import { createClient } from '@/lib/supabase/client'
import {
  createCompletionSoundFeed,
  prepareCompletionSound,
  closeCompletionSound,
} from './completion-sound'

type Reply = { data: unknown; error?: string }
type CoursePageSnapshot = {
  courses: import('./course-browse').CourseListing[]
  cursor: string | null
  stale?: boolean
}
type WorkspaceReply = { state: LmsState; hasMore: boolean; page?: number }
type PrefetchJob = {
  path: string
  write: number
  controller: AbortController
  workspace: Promise<WorkspaceReply>
  courseKey?: string
  course?: Promise<CoursePageSnapshot | undefined>
}
async function fetchWorkspace(
  path: string,
  page: number,
  signal: AbortSignal,
): Promise<WorkspaceReply> {
  const response = await fetch(`/api/workspace?page=${page}&focus=${encodeURIComponent(path)}`, {
    cache: 'no-store',
    signal,
  })
  const reply = await response.json()
  if (!response.ok)
    throw Object.assign(new Error(reply.error || 'Unable to load your workspace'), {
      status: response.status,
    })
  return reply
}
const Context = createContext<{
  state: LmsState
  user: User
  ready: boolean
  mutate: (command: LmsCommand) => Promise<boolean>
  execute: (command: LmsCommand) => Promise<unknown>
  notice: (message: string) => void
  prefetchSection: (path: string) => boolean
  invalidateCaches: () => void
  courseCache: {
    get: (key: string) => CoursePageSnapshot | undefined
    set: (key: string, value: CoursePageSnapshot) => void
    delete: (key: string) => void
    wait: (key: string) => Promise<CoursePageSnapshot | undefined>
    beginRequest: (key: string) => () => void
  }
} | null>(null)

function pageTitle(path: string) {
  const [, , section, detail, action] = path.split('/')
  if (section === 'courses') {
    if (detail === 'ai') return 'Create with AI'
    if (detail === 'new') return 'Create course'
    if (action === 'edit') return 'Edit course'
    if (action === 'learn') return 'Learning workspace'
    return detail ? 'Course overview' : 'Courses'
  }
  if (section === 'quizzes')
    return detail === 'new'
      ? 'Create quiz'
      : action === 'edit'
        ? 'Quiz editor'
        : detail
          ? 'Assessment'
          : 'Quizzes'
  if (section === 'students' && detail) return 'Student progress'
  return (
    (
      {
        catalog: 'Browse catalog',
        analytics: 'Analytics',
        users: 'User management',
        students: 'Students',
        settings: 'Settings',
        notifications: 'Notifications',
        certificates: 'Certificates',
        help: 'Help center',
      } as Record<string, string>
    )[section] || 'Dashboard'
  )
}

async function send(command: LmsCommand) {
  const response = await fetch('/api/commands', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(command),
  })
  const reply = (await response.json()) as Reply
  if (!response.ok)
    throw Object.assign(new Error(reply.error || 'Unable to save changes'), {
      status: response.status,
    })
  return reply.data
}
function merge(current: LmsState, incoming: LmsState): LmsState {
  const result = { ...current, ...incoming }
  for (const key of [
    'courses',
    'users',
    'enrollments',
    'certificates',
    'quizzes',
    'attempts',
    'notifications',
  ] as const) {
    // Every page is a bounded server query; later records replace earlier versions by ID.
    Object.assign(result, {
      [key]: Array.from(
        new Map([...current[key], ...incoming[key]].map((x) => [x.id, x])).values(),
      ),
    })
  }
  result.completedLessons = { ...current.completedLessons, ...incoming.completedLessons }
  result.notes = { ...current.notes, ...incoming.notes }
  result.preferences = { ...current.preferences, ...incoming.preferences }
  return result
}
export function LmsProvider({ children, user }: { children: React.ReactNode; user: User }) {
  const [state, setState] = useState<LmsState>({ ...emptyState, users: [user] })
  const current = useRef(state)
  const requestVersion = useRef(0)
  const writeVersion = useRef(0)
  const prefetchJob = useRef<PrefetchJob | null>(null)
  const lastPrefetch = useRef(-Infinity)
  const foreground = useRef(false)
  const courseRequests = useRef(0)
  const prefetchBudget = useRef<number[]>([])
  const controller = useRef<AbortController | null>(null)
  const routeCache = useRef(
    new Map<string, { state: LmsState; page: number; hasMore: boolean; at: number }>(),
  )
  const coursePages = useRef(new Map<string, { value: CoursePageSnapshot; at: number }>())
  const [ready, setReady] = useState(false)
  const [loadedPath, setLoadedPath] = useState('')
  const [error, setError] = useState('')
  const [refreshError, setRefreshError] = useState('')
  const [message, setMessage] = useState('')
  const [page, setPage] = useState(0)
  const [hasMore, setHasMore] = useState(false)
  const [busy, setBusy] = useState(false)
  const pathname = usePathname()
  const activePath = useRef(pathname)
  activePath.current = pathname
  const courseList = /^\/(?:learner\/catalog|(?:admin|tutor|learner)\/courses)\/?$/.test(pathname)
  const blankForm = /^\/(?:admin|tutor)\/(?:courses\/(?:new|ai)|quizzes\/new)\/?$/.test(pathname)
  // Cache lists and blank-form options. Saved editors and learning details always revalidate.
  const cacheable =
    /^\/(?:admin|tutor|learner)(?:\/(?:courses|catalog|quizzes|certificates|analytics|students|users)|\/(?:courses|quizzes)\/new)?\/?$/.test(
      pathname,
    )
  const cacheWrite = writeVersion.current
  function invalidateCaches() {
    writeVersion.current++
    prefetchJob.current?.controller.abort()
    routeCache.current.clear()
    coursePages.current.clear()
  }
  function rememberRoute(path: string, reply: WorkspaceReply) {
    routeCache.current.delete(path)
    routeCache.current.set(path, {
      state: reply.state,
      page: 0,
      hasMore: reply.hasMore,
      at: Date.now(),
    })
    if (routeCache.current.size > 8)
      routeCache.current.delete(routeCache.current.keys().next().value!)
  }
  function prefetchSection(path: string) {
    if (
      !ready ||
      loadedPath !== activePath.current ||
      busy ||
      foreground.current ||
      courseRequests.current > 0 ||
      prefetchJob.current ||
      document.visibilityState === 'hidden'
    )
      return false
    if (
      path === activePath.current ||
      !path.startsWith(`/${user.role}`) ||
      !/^\/(?:admin|tutor|learner)(?:\/(?:courses|catalog|quizzes|certificates|analytics|students|users)|\/(?:courses|quizzes)\/new)?$/.test(
        path,
      )
    )
      return false
    const connection =
      typeof navigator === 'undefined'
        ? undefined
        : (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } })
            .connection
    if (
      connection?.saveData ||
      /(^|-)2g$/.test(connection?.effectiveType || '') ||
      Date.now() - lastPrefetch.current < 1500
    )
      return false
    const cached = routeCache.current.get(path)
    const fresh = cached && Date.now() - cached.at < 30000
    const listing = /^\/(?:learner\/catalog|(?:admin|tutor|learner)\/courses)$/.test(path)
    const mode = path.endsWith('/catalog')
      ? 'catalog'
      : user.role === 'learner'
        ? 'mine'
        : 'managed'
    const courseKey = listing
      ? new URLSearchParams({ mode, q: '', level: '' }).toString()
      : undefined
    const existingCourses = courseKey ? coursePages.current.get(courseKey) : undefined
    const needCourses =
      !!courseKey && (!existingCourses || Date.now() - existingCourses.at >= 600000)
    if (fresh && !needCourses) return false
    prefetchBudget.current = prefetchBudget.current.filter((at) => Date.now() - at < 60000)
    if (prefetchBudget.current.length >= 6) return false
    prefetchBudget.current.push(Date.now())
    const abort = new AbortController(),
      write = writeVersion.current
    lastPrefetch.current = Date.now()
    const workspace = fresh
      ? Promise.resolve({ state: cached.state, hasMore: cached.hasMore })
      : fetchWorkspace(path, 0, abort.signal)
    const job: PrefetchJob = { path, write, controller: abort, workspace, courseKey }
    prefetchJob.current = job
    const timeout = setTimeout(() => abort.abort(), 8000)
    let rejected = false
    const handleFailure = (error: unknown) => {
      if (
        rejected ||
        abort.signal.aborted ||
        !error ||
        typeof error !== 'object' ||
        !('status' in error) ||
        (error.status !== 401 && error.status !== 403)
      )
        return
      rejected = true
      routeCache.current.clear()
      coursePages.current.clear()
      const cleared = { ...emptyState, users: [user] }
      current.current = cleared
      setState(cleared)
      setReady(false)
      setLoadedPath('')
      setError('Your session is no longer valid. Please sign in again.')
    }
    if (needCourses)
      job.course = workspace
        .then(async () => {
          if (abort.signal.aborted || write !== writeVersion.current) return undefined
          const response = await fetch(`/api/course-list?${courseKey}`, {
            cache: 'no-store',
            signal: abort.signal,
          })
          if (!response.ok)
            throw Object.assign(new Error('Unable to prefetch courses'), {
              status: response.status,
            })
          const page = await response.json()
          if (abort.signal.aborted || write !== writeVersion.current) return undefined
          const value = { courses: page.courses, cursor: page.nextCursor }
          courseCache.set(courseKey!, value)
          return value
        })
        .catch((error) => {
          handleFailure(error)
          return undefined
        })
    void (async () => {
      try {
        const reply = await workspace
        if (!abort.signal.aborted && write === writeVersion.current && !fresh)
          rememberRoute(path, reply)
        await job.course
      } catch (error) {
        handleFailure(error)
      } finally {
        clearTimeout(timeout)
        if (prefetchJob.current === job) prefetchJob.current = null
      }
    })()
    return true
  }
  const courseCache = {
    get(key: string) {
      const entry = coursePages.current.get(key)
      if (!entry || Date.now() - entry.at >= 600000) {
        coursePages.current.delete(key)
        return undefined
      }
      coursePages.current.delete(key)
      coursePages.current.set(key, entry)
      return { ...entry.value, stale: Date.now() - entry.at >= 30000 }
    },
    set(key: string, value: CoursePageSnapshot) {
      if (cacheWrite !== writeVersion.current) return
      coursePages.current.delete(key)
      if (value.courses.length > 60) return
      coursePages.current.set(key, { value, at: Date.now() })
      if (coursePages.current.size > 8)
        coursePages.current.delete(coursePages.current.keys().next().value!)
    },
    delete(key: string) {
      coursePages.current.delete(key)
    },
    async wait(key: string) {
      const job = prefetchJob.current
      if (!job || job.courseKey !== key || job.write !== writeVersion.current) return undefined
      const value = await job.course
      return !job.controller.signal.aborted && job.write === writeVersion.current
        ? value
        : undefined
    },
    beginRequest(key: string) {
      courseRequests.current++
      const job = prefetchJob.current
      if (job && (job.path !== activePath.current || job.courseKey !== key)) job.controller.abort()
      let finished = false
      return () => {
        if (!finished) {
          finished = true
          courseRequests.current--
        }
      }
    },
  }
  async function load(nextPage = 0) {
    if (activePath.current !== pathname) return
    const version = ++requestVersion.current
    const write = writeVersion.current
    controller.current?.abort()
    const abort = new AbortController()
    controller.current = abort
    foreground.current = true
    let reply: WorkspaceReply
    try {
      const job = prefetchJob.current
      if (
        nextPage === 0 &&
        job?.path === pathname &&
        job.write === write &&
        !job.controller.signal.aborted
      ) {
        try {
          reply = await job.workspace
        } catch {
          if (abort.signal.aborted) return
          reply = await fetchWorkspace(pathname, nextPage, abort.signal)
        }
      } else reply = await fetchWorkspace(pathname, nextPage, abort.signal)
    } finally {
      if (version === requestVersion.current) foreground.current = false
    }
    if (version !== requestVersion.current) return
    if (write !== writeVersion.current) return load(nextPage)
    const next = nextPage === 0 ? reply.state : merge(current.current, reply.state)
    current.current = next
    setState(next)
    setPage(nextPage)
    setHasMore(reply.hasMore)
    setReady(true)
    setLoadedPath(pathname)
    setError('')
    setRefreshError('')
    if (cacheable && nextPage === 0) {
      routeCache.current.delete(pathname)
      routeCache.current.set(pathname, {
        state: next,
        page: nextPage,
        hasMore: reply.hasMore,
        at: Date.now(),
      })
      if (routeCache.current.size > 8)
        routeCache.current.delete(routeCache.current.keys().next().value!)
    } else routeCache.current.delete(pathname)
  }
  useLayoutEffect(() => {
    if (prefetchJob.current && prefetchJob.current.path !== pathname)
      prefetchJob.current.controller.abort()
    let active = true
    const versionRef = requestVersion
    setError('')
    setRefreshError('')
    const entry = cacheable ? routeCache.current.get(pathname) : undefined
    const cached = entry && Date.now() - entry.at < 600000 ? entry : undefined
    if (cached) {
      routeCache.current.delete(pathname)
      routeCache.current.set(pathname, cached)
      const next = {
        ...cached.state,
        notifications: current.current.notifications,
        unreadNotifications: current.current.unreadNotifications,
      }
      current.current = next
      setState(next)
      setPage(cached.page)
      setHasMore(cached.hasMore)
      setReady(true)
      setLoadedPath(pathname)
      if (Date.now() - cached.at >= 30000) {
        load().catch((e) => {
          if (!active || e.name === 'AbortError') return
          if (e.status === 401 || e.status === 403) {
            routeCache.current.clear()
            coursePages.current.clear()
            setReady(false)
            setLoadedPath('')
            setError(e.message)
          } else setRefreshError('Unable to refresh. Showing your previous results.')
        })
      }
    } else {
      load().catch((e) => {
        if (!active || e.name === 'AbortError') return
        if (blankForm && e.status !== 401 && e.status !== 403)
          setRefreshError('Unable to load form options. Your work is still here.')
        else setError(e.message)
      })
    }
    return () => {
      active = false
      versionRef.current++
      foreground.current = false
      controller.current?.abort()
    }
    // Reload route-specific records when opening a course or assessment directly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])
  useEffect(
    () => () => {
      prefetchJob.current?.controller.abort()
    },
    [],
  )
  useEffect(() => {
    if (!message) return
    const timer = setTimeout(() => setMessage(''), 6000)
    return () => clearTimeout(timer)
  }, [message])
  useEffect(() => {
    let active = true
    let pending = false
    let soundEnabled = false
    const soundFeed = createCompletionSoundFeed(user.id)
    const soundPreference = () =>
      current.current.preferences?.[user.id]?.aiCompletionSound === false ? false : soundEnabled
    const unlockSound = () => {
      if (soundPreference() === true) prepareCompletionSound()
    }
    window.addEventListener('pointerdown', unlockSound)
    window.addEventListener('keydown', unlockSound)
    let timer: ReturnType<typeof setTimeout> | undefined
    const controller = new AbortController()
    const refresh = async () => {
      if (!active || pending || document.visibilityState === 'hidden') return
      pending = true
      try {
        const response = await fetch('/api/notifications', {
          cache: 'no-store',
          signal: controller.signal,
        })
        if (!response.ok) return
        const feed = await response.json()
        if (active) {
          soundEnabled = feed.completionSound === true
          soundFeed(
            feed.notifications,
            soundPreference() === true,
            document.visibilityState === 'visible' && document.hasFocus(),
          )
          if (
            current.current.unreadNotifications === feed.unreadCount &&
            JSON.stringify(current.current.notifications) === JSON.stringify(feed.notifications)
          )
            return
          const next = {
            ...current.current,
            notifications: feed.notifications,
            unreadNotifications: feed.unreadCount,
          }
          current.current = next
          setState(next)
        }
      } catch {
        /* Polling retries after temporary connection failures. */
      } finally {
        pending = false
      }
    }
    const schedule = () => {
      clearTimeout(timer)
      timer = setTimeout(() => void refresh(), 200)
    }
    const client = createClient()
    const channel = client
      .channel(`notifications:${user.id}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'notifications', filter: `user_id=eq.${user.id}` },
        schedule,
      )
      .subscribe(schedule)
    const poll = setInterval(() => void refresh(), 30000)
    document.addEventListener('visibilitychange', schedule)
    window.addEventListener('focus', schedule)
    return () => {
      active = false
      controller.abort()
      clearTimeout(timer)
      clearInterval(poll)
      document.removeEventListener('visibilitychange', schedule)
      window.removeEventListener('focus', schedule)
      window.removeEventListener('pointerdown', unlockSound)
      window.removeEventListener('keydown', unlockSound)
      closeCompletionSound()
      void client.removeChannel(channel)
    }
  }, [user.id])
  async function execute(command: LmsCommand) {
    const result = await send(command)
    if (
      command.type === 'quizResult' ||
      (command.type === 'quizAttempts' && command.action === 'list')
    )
      return result
    writeVersion.current++
    prefetchJob.current?.controller.abort()
    // All successful writes invalidate navigation snapshots, including related lists.
    routeCache.current.clear()
    coursePages.current.clear()
    if (command.type === 'award') {
      if (command.action !== 'candidates')
        await load().catch(() =>
          setMessage('Award action saved. Refresh to update your certificates.'),
        )
      return result
    }
    if (command.type === 'startQuiz') return result
    if (command.type === 'quizAttempts') {
      await load().catch(() =>
        setMessage('Additional attempts granted. Refresh to update the learner list.'),
      )
      return result
    }
    if (command.type === 'submitQuiz') {
      await load().catch(() =>
        setMessage('Assessment submitted. Refresh to update your progress and certificates.'),
      )
      return result
    }
    if (command.type === 'readNotification') {
      const affected = current.current.notifications.filter(
        (n) => !n.isRead && (!command.id || n.id === command.id),
      ).length
      const next = {
        ...current.current,
        notifications: current.current.notifications.map((n) =>
          !command.id || n.id === command.id ? { ...n, isRead: true } : n,
        ),
        unreadNotifications: command.id
          ? Math.max(0, current.current.unreadNotifications - affected)
          : 0,
      }
      current.current = next
      setState(next)
      try {
        const response = await fetch('/api/notifications', { cache: 'no-store' })
        if (!response.ok) throw new Error()
        const feed = await response.json()
        const refreshed = {
          ...current.current,
          notifications: feed.notifications,
          unreadNotifications: feed.unreadCount,
        }
        current.current = refreshed
        setState(refreshed)
      } catch {
        setMessage('Read status saved. The feed will refresh when the connection returns.')
      }
      return result
    }
    if (command.type === 'saveQuiz') {
      const next = {
        ...current.current,
        quizzes: [
          {
            ...command.quiz,
            status: command.quiz.status || 'published',
            version: command.quiz.version ? command.quiz.version + 1 : 1,
            editLocked: false,
          },
          ...current.current.quizzes.filter((q) => q.id !== command.quiz.id),
        ],
      }
      current.current = next
      setState(next)
      await load().catch(() =>
        setMessage('Assessment saved. Refresh to load the latest workspace.'),
      )
      return result
    }
    if (command.type === 'worksheet') {
      const next = {
        ...current.current,
        courses: current.current.courses.map((c) => ({
          ...c,
          modules: c.modules.map((m) => ({
            ...m,
            lessons: m.lessons.map((l) =>
              l.id === command.lessonId ? { ...l, worksheet: command.body.trim() } : l,
            ),
          })),
        })),
      }
      current.current = next
      setState(next)
      return result
    }
    if (command.type === 'note') {
      const course = current.current.courses.find((c) =>
        c.modules.some((m) => m.lessons.some((l) => l.id === command.lessonId)),
      )
      if (course) {
        const next = {
          ...current.current,
          notes: {
            ...current.current.notes,
            [`${user.id}:${course.id}:${command.lessonId}`]: command.body,
          },
        }
        current.current = next
        setState(next)
      }
      return result
    }
    if (command.type === 'saveCourse') {
      // A committed save remains successful even when the follow-up read fails.
      // Keep the course available while the destination loads its focused record.
      const next = {
        ...current.current,
        courses: [
          {
            ...command.course,
            ...(result && typeof result === 'object' && 'updatedAt' in result
              ? { updatedAt: String(result.updatedAt) }
              : {}),
          },
          ...current.current.courses.filter((c) => c.id !== command.course.id),
        ],
      } as LmsState
      current.current = next
      setState(next)
      await load().catch(() => setMessage('Course saved. Refresh to load the latest workspace.'))
    } else if (command.type === 'invite') {
      // Preserve the newly issued setup link even if refreshing the list fails.
      await load().catch(() => setMessage('Account created. Refresh the user list to see it.'))
    } else if (command.type === 'complete') {
      await load().catch(() => setMessage('Lesson completed. Refresh to update your progress.'))
    } else if (command.type === 'claimCertificate') {
      await load().catch(() => setMessage('Certificate issued. Refresh to view it.'))
    } else await load()
    return result
  }
  async function mutate(command: LmsCommand) {
    setBusy(true)
    try {
      await execute(command)
      return true
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Unable to save changes')
      return false
    } finally {
      setBusy(false)
    }
  }
  return (
    <Context.Provider
      value={{
        state,
        user,
        ready: (ready && loadedPath === pathname) || courseList,
        courseCache,
        mutate,
        execute,
        notice: setMessage,
        prefetchSection,
        invalidateCaches,
      }}
    >
      <DashboardLayout
        role={user.role}
        userName={user.name}
        userAvatar={user.avatar}
        pageTitle={pageTitle(pathname)}
      >
        {refreshError && !error && (loadedPath === pathname || blankForm) && (
          <div role="status" className="mb-4 flex items-center gap-3 text-sm text-slate-500">
            <span>{refreshError}</span>
            <button
              className="font-medium text-brand-600"
              onClick={() =>
                load().catch((e) => {
                  if (activePath.current !== pathname || e.name === 'AbortError') return
                  if (e.status === 401 || e.status === 403) {
                    routeCache.current.clear()
                    coursePages.current.clear()
                    setReady(false)
                    setError(e.message)
                  } else setRefreshError('Unable to refresh. Showing your previous results.')
                })
              }
            >
              Retry
            </button>
          </div>
        )}
        {error ? (
          <div className="min-h-[50vh] flex flex-col items-center justify-center gap-4 p-8 text-center">
            <h1 className="text-xl font-semibold">Your workspace is not available yet</h1>
            <p className="max-w-xl text-slate-500">{error}</p>
            <button
              className="text-brand-600"
              onClick={() => load().catch((e) => setError(e.message))}
            >
              Try again
            </button>
            <Link href="/">Back to CyberPurview</Link>
          </div>
        ) : (ready && loadedPath === pathname) || courseList || blankForm ? (
          <>
            {hasMore && loadedPath === pathname && (
              <div className="fixed bottom-4 left-1/2 z-50 rounded-xl bg-white border shadow-lg p-3 text-sm">
                <button
                  disabled={busy}
                  onClick={() => load(page + 1).catch((e) => setMessage(e.message))}
                >
                  Load more workspace records
                </button>
              </div>
            )}
            {children}
          </>
        ) : (
          <DashboardContentSkeleton />
        )}
      </DashboardLayout>
      {busy && (
        <div
          role="status"
          className="fixed inset-0 z-[90] bg-white/40 flex items-center justify-center"
        >
          <span className="rounded-xl bg-white p-4 shadow-lg">Saving changes…</span>
        </div>
      )}
      {message && (
        <div
          role="status"
          className="fixed bottom-6 right-4 left-4 sm:left-auto sm:w-96 z-[100] rounded-2xl bg-navy p-4 text-sm text-white shadow-xl flex justify-between gap-4"
        >
          {message}
          <button aria-label="Dismiss notification" onClick={() => setMessage('')}>
            ×
          </button>
        </div>
      )}
    </Context.Provider>
  )
}
export function useLms() {
  const value = useContext(Context)
  if (!value) throw new Error('LmsProvider is required')
  return value
}
export function downloadText(filename: string, content: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([content], { type }))
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function csv(rows: (string | number)[][]) {
  return rows.map((r) => r.map((v) => `"${String(v).replace(/"/g, '""')}"`).join(',')).join('\r\n')
}
