'use client'
import React from 'react'
import Link from 'next/link'
import { ArrowLeft, Search } from 'lucide-react'
import type { Role } from '@/types'
export function FeatureShell({
  role,
  title,
  children,
}: {
  role: Role
  title: string
  children: React.ReactNode
}) {
  return (
    <section aria-label={title} data-role={role}>
      {children}
    </section>
  )
}
export function Heading({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow?: string
  title: string
  description?: string
  children?: React.ReactNode
}) {
  return (
    <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div>
        {eyebrow && (
          <p className="mb-2 text-xs uppercase tracking-[.18em] font-semibold text-brand-600">
            {eyebrow}
          </p>
        )}
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-navy">{title}</h2>
        {description && <p className="mt-2 text-sm text-slate-500 max-w-2xl">{description}</p>}
      </div>
      {children}
    </div>
  )
}
export function Panel({
  children,
  className = '',
}: {
  children: React.ReactNode
  className?: string
}) {
  return (
    <div
      className={`rounded-2xl border border-slate-200/70 bg-white p-5 sm:p-6 shadow-sm ${className}`}
    >
      {children}
    </div>
  )
}
export const inputClass =
  'w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 outline-none focus:border-brand-500 focus:ring-2 focus:ring-brand-100'
export const primaryClass =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-brand-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-brand-700 transition-colors disabled:opacity-40 disabled:cursor-not-allowed'
export const secondaryClass =
  'inline-flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-600 hover:bg-slate-50 transition-colors'
export function SearchField({
  value,
  onChange,
  placeholder = 'Search...',
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div className="relative min-w-0 flex-1">
      <Search className="absolute top-3 left-3 w-4 h-4 text-slate-400" />
      <input
        aria-label={placeholder}
        className={`${inputClass} pl-10`}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}
export function Empty({
  title = 'No results found',
  description = 'Try a different search or filter.',
  href,
  action,
}: {
  title?: string
  description?: string
  href?: string
  action?: string
}) {
  return (
    <Panel className="text-center py-16">
      <h3 className="font-semibold text-navy">{title}</h3>
      <p className="mt-2 mb-5 text-sm text-slate-500">{description}</p>
      {href && (
        <Link className={primaryClass} href={href}>
          {action || 'Browse courses'}
        </Link>
      )}
    </Panel>
  )
}
export function Back({ href, label = 'Back to courses' }: { href: string; label?: string }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center gap-2 text-sm text-slate-500 hover:text-brand-600 mb-4 scroll-mt-24"
    >
      <ArrowLeft className="w-4 h-4" />
      {label}
    </Link>
  )
}
export function Field({
  label,
  children,
  className = '',
}: {
  label: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <label className={`block min-w-0 ${className}`}>
      <span className="mb-1.5 block text-sm font-medium text-slate-700">{label}</span>
      {children}
    </label>
  )
}
