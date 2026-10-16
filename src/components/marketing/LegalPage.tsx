import Link from 'next/link'
import type { ReactNode } from 'react'
import { LandingHeader } from './LandingHeader'

export const LEGAL_CONTACT = '/contact'

export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="min-h-screen bg-[#faf9f6] text-navy">
      <LandingHeader />
      <main id="main-content" className="mx-auto max-w-3xl px-5 py-12 sm:px-8 sm:py-16">
        <nav aria-label="Legal pages" className="mb-8 flex flex-wrap gap-5 text-sm">
          <Link href="/privacy" className="text-brand-600 underline underline-offset-4">
            Privacy Policy
          </Link>
          <Link href="/terms" className="text-brand-600 underline underline-offset-4">
            Terms of Service
          </Link>
        </nav>
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{title}</h1>
        <p className="mt-3 text-sm text-slate-500">Last updated: October 16, 2026</p>
        <article className="mt-10 space-y-8 text-base leading-8 text-slate-700 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h2]:text-navy [&_p+p]:mt-3 [&_a]:text-brand-600 [&_a]:underline [&_a]:underline-offset-4">
          {children}
        </article>
        <footer className="mt-12 border-t border-slate-200 pt-6 text-sm text-slate-500">
          Cyber Purview LLC ·{' '}
          <Link href={LEGAL_CONTACT} className="text-brand-600">
            Contact us
          </Link>
        </footer>
      </main>
    </div>
  )
}
