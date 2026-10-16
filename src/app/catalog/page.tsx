import Link from 'next/link'
import { LandingHeader } from '@/components/marketing/LandingHeader'
import { PublicCourseCard } from '@/components/marketing/PublicCourseCard'
import { catalogFilters, publicCoursePage } from '@/lib/server/public-catalog'
import { courseCategories } from '@/lib/server/catalog'

export const dynamic = 'force-dynamic'
export const metadata = { title: 'Course catalog | CyberPurview' }
export default async function Catalog({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const raw = await searchParams
  const parsed = catalogFilters.safeParse(raw)
  const filters = parsed.success ? parsed.data : catalogFilters.parse({})
  const [page, categories] = await Promise.all([
    parsed.success ? publicCoursePage(filters) : Promise.resolve(null),
    courseCategories(),
  ])
  const field = 'w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-navy'
  const next = new URLSearchParams({
    q: filters.q,
    category: filters.category,
    level: filters.level,
  })
  if (page?.nextCursor) next.set('cursor', page.nextCursor)
  return (
    <div className="min-h-screen bg-[#faf9f6] text-navy">
      <LandingHeader />
      <main className="mx-auto max-w-[1200px] px-5 py-10 sm:px-8 sm:py-14">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">Explore courses</h1>
        <p className="mt-3 text-slate-500">
          Find your next course in cybersecurity, audit, governance, and cloud security.
        </p>
        <form
          action="/catalog"
          method="get"
          className="my-8 grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_auto]"
        >
          <label className="text-sm font-medium">
            <span className="sr-only">Search courses</span>
            <input
              className={field}
              type="search"
              name="q"
              maxLength={200}
              defaultValue={filters.q}
              placeholder="What would you like to learn?"
            />
          </label>
          <label className="text-sm font-medium">
            <span className="sr-only">Category</span>
            <select name="category" defaultValue={filters.category} className={field}>
              <option value="">All categories</option>
              {categories.map((c) => (
                <option key={c}>{c}</option>
              ))}
            </select>
          </label>
          <label className="text-sm font-medium">
            <span className="sr-only">Level</span>
            <select name="level" defaultValue={filters.level} className={field}>
              <option value="">All levels</option>
              {['Beginner', 'Intermediate', 'Advanced'].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </label>
          <button className="rounded-xl bg-brand-600 px-6 py-3 text-sm font-semibold text-white hover:bg-brand-700">
            Search
          </button>
        </form>
        {!parsed.success ? (
          <p role="alert">Invalid search filters. Please submit a new search.</p>
        ) : (
          <>
            {filters.q && <p className="mb-5 text-sm text-slate-600">Results for “{filters.q}”</p>}
            {page?.courses.length ? (
              <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
                {page.courses.map((course) => (
                  <PublicCourseCard key={course.id} course={course} />
                ))}
              </div>
            ) : (
              <div className="rounded-2xl border border-slate-200 bg-white p-10 text-center">
                <h2 className="font-semibold">No courses found</h2>
                <p className="mt-2 text-sm text-slate-500">Try another search or category.</p>
                <Link
                  href="/catalog"
                  className="mt-5 inline-block text-sm font-semibold text-brand-700"
                >
                  Clear filters
                </Link>
              </div>
            )}
            <div className="mt-8 flex justify-center gap-5">
              {filters.cursor && (
                <Link
                  href={`/catalog?${new URLSearchParams({ q: filters.q, category: filters.category, level: filters.level })}`}
                  className="text-sm font-medium text-brand-700"
                >
                  Back to first results
                </Link>
              )}
              {page?.nextCursor && (
                <Link
                  prefetch={false}
                  href={`/catalog?${next}`}
                  className="rounded-xl border border-slate-200 bg-white px-6 py-3 text-sm font-semibold hover:border-brand-300"
                >
                  Next courses
                </Link>
              )}
            </div>
          </>
        )}
      </main>
    </div>
  )
}
