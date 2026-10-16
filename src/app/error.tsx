'use client'
export default function Error({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
      <div className="text-center">
        <h1 className="text-2xl font-bold mb-3">Something interrupted your workspace.</h1>
        <p className="text-sm text-slate-500 mb-5">Try opening this page again.</p>
        <button className="bg-brand-600 text-white rounded-xl px-5 py-3" onClick={reset}>
          Try again
        </button>
      </div>
    </div>
  )
}
