'use client'
import Link from 'next/link'
export default function CatalogError({ reset }: { reset: () => void }) {
  return (
    <main className="mx-auto max-w-lg px-5 py-20 text-center text-navy">
      <h1 className="text-2xl font-semibold">Courses are temporarily unavailable</h1>
      <p className="mt-3 text-slate-500">Please try again in a moment.</p>
      <button onClick={reset} className="mt-6 rounded-xl bg-brand-600 px-5 py-3 text-white">
        Try again
      </button>
      <Link href="/" className="mt-5 block text-sm text-brand-700">
        Back to home
      </Link>
    </main>
  )
}
