'use client'
import { useState } from 'react'
import Link from 'next/link'
import { ArrowUpRight, Menu, X } from 'lucide-react'
import { BrandLogo } from '@/components/shared/BrandLogo'

export function Brand({ light = false }: { light?: boolean }) {
  return (
    <Link href="/" aria-label="CyberPurview home" className="inline-flex items-center">
      <BrandLogo light={light} />
    </Link>
  )
}
const links = [
  { label: 'Explore courses', href: '/catalog' },
  { label: 'Why CyberPurview', href: '/#why-cyberpurview' },
  { label: 'For instructors', href: '/#teach' },
]
export function LandingHeader() {
  const [open, setOpen] = useState(false)
  return (
    <header className="sticky top-0 z-40 border-b border-slate-200/60 bg-[#faf9f6] shadow-sm">
      <div className="mx-auto flex h-20 max-w-[1200px] items-center justify-between gap-6 px-5 sm:px-8">
        <Brand />
        <nav aria-label="Main navigation" className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              className="text-sm font-medium text-slate-600 transition-colors hover:text-brand-600"
            >
              {l.label}
            </a>
          ))}
        </nav>
        <div className="hidden items-center gap-5 md:flex">
          <Link href="/login" className="text-sm font-semibold text-slate-700 hover:text-brand-600">
            Sign in
          </Link>
          <Link
            href="/login?role=learner"
            className="inline-flex items-center gap-2 rounded-full bg-brand-600 px-5 py-3 text-sm font-semibold text-white transition-colors hover:bg-brand-700"
          >
            Start learning <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <button
          aria-label={open ? 'Close menu' : 'Open menu'}
          aria-expanded={open}
          aria-controls="mobile-navigation"
          className="rounded-xl border border-slate-200 p-2.5 text-slate-600 md:hidden"
          onClick={() => setOpen(!open)}
        >
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>
      {open && (
        <nav
          id="mobile-navigation"
          aria-label="Mobile navigation"
          className="absolute left-0 right-0 top-full max-h-[calc(100dvh-5rem)] overflow-y-auto border-b border-slate-200 bg-[#faf9f6] px-5 pb-6 shadow-lg md:hidden"
        >
          {links.map((l) => (
            <a
              key={l.href}
              href={l.href}
              onClick={() => setOpen(false)}
              className="block border-t border-slate-200/60 py-4 text-sm font-medium text-slate-600"
            >
              {l.label}
            </a>
          ))}
          <div className="mt-3 flex gap-3">
            <Link
              className="flex-1 rounded-full border border-slate-200 px-5 py-3 text-center text-sm font-semibold"
              href="/login"
            >
              Sign in
            </Link>
            <Link
              className="flex-1 rounded-full bg-brand-600 px-5 py-3 text-center text-sm font-semibold text-white"
              href="/login?role=learner"
            >
              Start learning
            </Link>
          </div>
        </nav>
      )}
    </header>
  )
}
