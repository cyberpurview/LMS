'use client'
import { learnerCourseUrl } from '@/lib/lms/course-url'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { Plus, ArrowRight } from 'lucide-react'
import { useLms } from '@/lib/lms/store'
import { COURSE_BATCH_SIZE, type CourseListing, type CoursePage } from '@/lib/lms/course-browse'
import type { Role } from '@/types'
import { CourseCard } from '@/components/shared/ui'
import {
  FeatureShell,
  Heading,
  SearchField,
  Empty,
  inputClass,
  primaryClass,
  secondaryClass,
} from './common'

export function CourseBrowser({ role, catalog = false }: { role: Role; catalog?: boolean }) {
  const { state, courseCache } = useLms()
  const router = useRouter(),
    params = useSearchParams()
  const [search, setSearch] = useState(params.get('q') || '')
  const [filter, setFilter] = useState('All'),
    [level, setLevel] = useState('All')
  const [courses, setCourses] = useState<CourseListing[]>([]),
    [cursor, setCursor] = useState<string | null>(null)
  const listedCourses = useRef<CourseListing[]>([])
  const [loading, setLoading] = useState(true),
    [error, setError] = useState('')
  const [refreshing, setRefreshing] = useState(false)
  const failedPage = useRef<{ after: string | null; background: boolean } | null>(null)
  const generation = useRef(0),
    pending = useRef(false),
    controller = useRef<AbortController | null>(null)
  const mode = catalog ? 'catalog' : role === 'learner' ? 'mine' : 'managed'
  const query = new URLSearchParams({ mode, q: search, level: level === 'All' ? '' : level })
  if (filter !== 'All')
    query.set(
      catalog ? 'category' : 'state',
      filter === 'Completed' ? 'completed' : filter === 'In progress' ? 'ongoing' : filter,
    )
  const queryKey = query.toString()
  useEffect(() => setSearch(params.get('q') || ''), [params])
  async function fetchPage(after: string | null, version: number, background = false) {
    if (pending.current || version !== generation.current) return
    pending.current = true
    const finishRequest = courseCache?.beginRequest?.(queryKey)
    if (background) setRefreshing(true)
    else setLoading(true)
    setError('')
    const abort = new AbortController()
    controller.current = abort
    try {
      const visibleCount = background ? Math.min(60, listedCourses.current.length) : 0
      let nextAfter = after
      let page: CoursePage = { courses: [], nextCursor: null }
      // Revalidate the displayed pages together so returning to a longer list doesn't shrink it.
      for (let batch = 0; batch < 5; batch++) {
        const url = new URLSearchParams(queryKey)
        if (nextAfter) url.set('cursor', nextAfter)
        const response = await fetch(`/api/course-list?${url}`, {
          cache: 'no-store',
          signal: abort.signal,
        })
        const reply = await response.json()
        if (version !== generation.current || abort.signal.aborted) return
        if (!response.ok)
          throw Object.assign(new Error(reply.error || 'Unable to load courses.'), {
            status: response.status,
          })
        const incoming = reply as CoursePage
        page = { courses: [...page.courses, ...incoming.courses], nextCursor: incoming.nextCursor }
        if (!background || !incoming.nextCursor || page.courses.length >= visibleCount) break
        nextAfter = incoming.nextCursor
      }
      const next = after
        ? Array.from(
            new Map([...listedCourses.current, ...page.courses].map((c) => [c.id, c])).values(),
          )
        : page.courses
      listedCourses.current = next
      setCourses(next)
      courseCache?.set(queryKey, { courses: next, cursor: page.nextCursor })
      setCursor(page.nextCursor)
      failedPage.current = null
    } catch (e) {
      if (version === generation.current && !abort.signal.aborted) {
        failedPage.current = { after, background }
        if (e && typeof e === 'object' && 'status' in e && (e.status === 401 || e.status === 403)) {
          listedCourses.current = []
          setCourses([])
          setCursor(null)
          courseCache?.delete(queryKey)
        }
        setError(e instanceof Error ? e.message : 'Unable to load courses.')
      }
    } finally {
      finishRequest?.()
      if (version === generation.current) {
        pending.current = false
        setLoading(false)
        setRefreshing(false)
      }
    }
  }
  useLayoutEffect(() => {
    const versionRef = generation
    const version = ++versionRef.current
    controller.current?.abort()
    pending.current = false
    failedPage.current = null
    setRefreshing(false)
    setCourses([])
    listedCourses.current = []
    setCursor(null)
    setError('')
    setLoading(true)
    const cached = courseCache?.get(queryKey)
    if (cached) {
      listedCourses.current = cached.courses
      setCourses(cached.courses)
      setCursor(cached.cursor)
      setLoading(false)
      if (cached.stale) void fetchPage(null, version, true)
      return () => {
        versionRef.current++
        controller.current?.abort()
      }
    }
    const timer = setTimeout(
      () =>
        void (async () => {
          const prefetched = await courseCache?.wait?.(queryKey)
          if (version !== generation.current) return
          if (prefetched) {
            listedCourses.current = prefetched.courses
            setCourses(prefetched.courses)
            setCursor(prefetched.cursor)
            setLoading(false)
          } else await fetchPage(null, version)
        })(),
      search ? 300 : 0,
    )
    return () => {
      clearTimeout(timer)
      controller.current?.abort()
      versionRef.current++
    }
    // A new filter starts a fresh cursor; older responses cannot overwrite it.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [queryKey])
  const filters = catalog
    ? ['All', ...state.categories]
    : role === 'learner'
      ? ['All', 'In progress', 'Completed']
      : ['All', 'published', 'draft', 'archived']
  return (
    <FeatureShell role={role} title={catalog ? 'Browse Catalog' : 'Courses'}>
      <Heading
        title={
          catalog
            ? 'Browse courses'
            : role === 'learner'
              ? 'Your learning journey'
              : role === 'tutor'
                ? 'Your course library'
                : 'Course management'
        }
      >
        {role !== 'learner' ? (
          <>
            <Link className={secondaryClass} href={`/${role}/courses/ai`}>
              Create with AI
            </Link>
            <Link className={primaryClass} href={`/${role}/courses/new`}>
              <Plus className="w-4 h-4" />
              Create course
            </Link>
          </>
        ) : !catalog ? (
          <Link className={primaryClass} href="/learner/catalog">
            Explore courses <ArrowRight className="w-4 h-4" />
          </Link>
        ) : null}
      </Heading>
      <div className="flex flex-wrap gap-3 mb-5">
        <SearchField value={search} onChange={setSearch} placeholder="Search courses" />
        <select
          aria-label="Course level"
          className={`${inputClass} !w-auto`}
          value={level}
          onChange={(e) => setLevel(e.target.value)}
        >
          {['All', 'Beginner', 'Intermediate', 'Advanced'].map((l) => (
            <option key={l}>{l}</option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f}
            aria-pressed={filter === f}
            onClick={() => setFilter(f)}
            className={`rounded-full px-4 py-2 text-sm capitalize font-medium ${filter === f ? 'bg-navy text-white' : 'bg-white text-slate-500 border border-slate-200 hover:border-brand-300'}`}
          >
            {f}
          </button>
        ))}
      </div>
      <p role="status" aria-live="polite" className="text-xs text-slate-400 mb-4">
        {loading && !courses.length
          ? 'Finding courses…'
          : `${courses.length} ${courses.length === 1 ? 'course' : 'courses'} shown`}
      </p>
      {courses.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {courses.map((c) => (
            <CourseCard
              key={c.id}
              title={c.title}
              instructor={c.tutorName}
              instructorAvatar={c.tutorAvatar}
              thumbnail={c.thumbnail}
              category={c.category}
              level={c.level}
              duration={c.duration}
              enrolledCount={c.enrolledCount}
              rating={0}
              price={c.price}
              status={c.status}
              progress={c.progress ?? undefined}
              onClick={() =>
                router.push(role === 'learner' ? learnerCourseUrl(c) : `/${role}/courses/${c.id}`)
              }
            />
          ))}
        </div>
      ) : loading ? (
        <div
          aria-label="Loading courses"
          className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6"
        >
          {Array.from({ length: COURSE_BATCH_SIZE }, (_, i) => (
            <div key={i} className="h-80 animate-pulse rounded-2xl bg-slate-100" />
          ))}
        </div>
      ) : !error ? (
        <Empty />
      ) : null}
      <div className="mt-8 text-center space-y-3">
        {error && (
          <p role="alert" className="text-sm text-rose-600">
            {error}
          </p>
        )}
        {(cursor || error) && (
          <button
            className={`${secondaryClass} disabled:opacity-50`}
            disabled={loading || refreshing}
            onClick={() =>
              void fetchPage(
                failedPage.current ? failedPage.current.after : cursor,
                generation.current,
                failedPage.current?.background || false,
              )
            }
          >
            {loading ? 'Loading more courses…' : error ? 'Try again' : 'Load more courses'}
          </button>
        )}
        {!cursor && !loading && !error && courses.length > 0 && (
          <p className="text-xs text-slate-400">You’ve reached the end of these results.</p>
        )}
      </div>
    </FeatureShell>
  )
}
