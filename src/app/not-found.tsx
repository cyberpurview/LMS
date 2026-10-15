import Link from 'next/link'
import { BrandLogo } from '@/components/shared/BrandLogo'
export default function NotFound() {
  return (
    <main className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="text-center">
        <Link href="/" aria-label="CyberPurview home" className="inline-flex mb-6">
          <BrandLogo />
        </Link>
        <p className="text-brand-600 font-semibold text-sm mb-3">CYBERPURVIEW · 404</p>
        <h1 className="text-3xl font-bold text-navy mb-3">This page took a different path.</h1>
        <p className="text-slate-500 text-sm mb-6">
          Let’s get you back to your learning workspace.
        </p>
        <Link
          className="bg-brand-600 text-white px-5 py-3 rounded-xl text-sm font-semibold inline-block"
          href="/login"
        >
          Choose your workspace
        </Link>
      </div>
    </main>
  )
}
