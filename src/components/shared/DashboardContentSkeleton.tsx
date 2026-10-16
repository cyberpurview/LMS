export function DashboardContentSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="space-y-6 motion-safe:animate-pulse">
      <span className="sr-only">Loading page…</span>
      <div className="h-8 w-48 rounded-lg bg-slate-200" />
      <div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-56 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-5 h-28 rounded-xl bg-slate-100" />
            <div className="h-4 w-2/3 rounded bg-slate-100" />
          </div>
        ))}
      </div>
    </div>
  )
}
