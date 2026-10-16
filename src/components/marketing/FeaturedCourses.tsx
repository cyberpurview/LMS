'use client'
import { useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { ArrowUpRight, Search } from 'lucide-react'
import type { Course } from '@/types'

const photos: Record<string, { src: string; alt: string }> = {
  Cybersecurity: {
    src: '/images/course-development.jpg',
    alt: 'Laptop and notebook in a developer workspace',
  },
  'IT Audit & SOX': {
    src: '/images/course-data.jpg',
    alt: 'Data visualizations on a computer screen',
  },
  'Risk & Governance': {
    src: '/images/learning-together.jpg',
    alt: 'A group collaborating around a table',
  },
  'Cloud & DevSecOps': {
    src: '/images/course-development.jpg',
    alt: 'Laptop and notebook in a developer workspace',
  },
}
const fallbackPhoto = photos.Cybersecurity
export function FeaturedCourses({
  published,
  categoryNames,
}: {
  published: Course[]
  categoryNames: string[]
}) {
  const categories = ['All courses', ...categoryNames]
  const [category, setCategory] = useState('All courses')
  const courses = published
    .filter(
      (c) => c.status === 'published' && (category === 'All courses' || c.category === category),
    )
    .slice(0, 3)
  return (
    <section id="courses" className="scroll-mt-8 bg-white py-20 sm:py-24">
      <div className="mx-auto max-w-[1200px] px-5 sm:px-8">
        <div className="mb-8 flex flex-wrap items-end justify-between gap-6">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[.18em] text-brand-600">
              Find your next interest
            </p>
            <h2 className="text-3xl font-semibold tracking-tight text-navy sm:text-[40px] sm:leading-tight">
              Big possibilities.
              <br />
              One course at a time.
            </h2>
          </div>
          <Link
            href="/catalog"
            className="inline-flex items-center gap-2 border-b border-slate-300 pb-2 text-sm font-semibold text-slate-700 hover:border-brand-600 hover:text-brand-600"
          >
            Explore the full catalog <ArrowUpRight className="h-4 w-4" />
          </Link>
        </div>
        <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Course categories">
          {categories.map((c) => (
            <button
              key={c}
              onClick={() => setCategory(c)}
              aria-pressed={category === c}
              className={`rounded-full border px-4 py-2.5 text-xs font-medium transition-colors sm:text-sm ${category === c ? 'border-navy bg-navy text-white' : 'border-slate-200 bg-white text-slate-500 hover:border-brand-300 hover:text-brand-600'}`}
            >
              {c}
            </button>
          ))}
        </div>
        <div className="grid gap-6 md:grid-cols-3">
          {!courses.length && (
            <p className="text-slate-500 py-10">
              New courses are on the way. Create an account to start your learning journey.
            </p>
          )}
          {courses.map((c) => (
            <Link
              key={c.id}
              href={`/catalog/${c.slug}`}
              className="group overflow-hidden rounded-2xl border border-slate-200/80 bg-white transition-all hover:-translate-y-1 hover:border-brand-200 hover:shadow-lg"
            >
              <div className="relative aspect-video overflow-hidden">
                <Image
                  src={c.thumbnail || (photos[c.category] || fallbackPhoto).src}
                  alt={c.thumbnail ? c.title : (photos[c.category] || fallbackPhoto).alt}
                  fill
                  sizes="(max-width: 767px) 100vw, 33vw"
                  className="object-cover transition-transform duration-500 group-hover:scale-105"
                />
                <span className="absolute left-4 top-4 rounded-full bg-white/95 px-3 py-1.5 text-[11px] font-semibold text-slate-700">
                  {c.level}
                </span>
              </div>
              <div className="p-5 sm:p-6">
                <p className="mb-3 text-[11px] font-semibold uppercase tracking-wider text-brand-600">
                  {c.category}
                </p>
                <h3 className="min-h-14 text-lg font-semibold leading-snug tracking-tight text-navy group-hover:text-brand-600">
                  {c.title}
                </h3>
                <p className="mb-5 mt-3 text-xs text-slate-400">with {c.tutorName}</p>
                <div className="flex items-center justify-between border-t border-slate-100 pt-4">
                  <span className="flex items-center gap-1.5 text-xs text-slate-500">
                    {c.duration} hours <span className="mx-1 text-slate-200">|</span>
                    {c.modules.length || 1} {c.modules.length > 1 ? 'modules' : 'module'}
                  </span>
                  <ArrowUpRight className="h-5 w-5 text-slate-400 group-hover:text-brand-600" />
                </div>
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-9 rounded-2xl border border-slate-200/70 bg-[#faf9f6] p-5 sm:flex sm:items-center sm:justify-between sm:gap-8 sm:p-6">
          <div>
            <p className="text-sm font-semibold text-slate-800">
              Already know what you want to learn?
            </p>
            <p className="mt-1 text-xs text-slate-500">Find a course that fits your next step.</p>
          </div>
          <form
            action="/catalog"
            method="get"
            className="mt-4 flex items-center gap-2 rounded-full border border-slate-200 bg-white p-1.5 sm:mt-0 sm:w-96"
          >
            <Search className="ml-3 h-4 w-4 shrink-0 text-slate-400" />
            <input
              aria-label="Search the course catalog"
              type="search"
              name="q"
              placeholder="Try cybersecurity, SOX, or cloud security…"
              className="min-w-0 flex-1 bg-transparent py-2 text-xs outline-none"
              required
            />
            <button
              aria-label="Search courses"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-600 text-white hover:bg-brand-700"
            >
              <ArrowUpRight className="h-4 w-4" />
            </button>
          </form>
        </div>
      </div>
    </section>
  )
}
