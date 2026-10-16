import Link from 'next/link'
import Image from 'next/image'
import { notFound } from 'next/navigation'
import { LandingHeader } from '@/components/marketing/LandingHeader'
import { publicCourse } from '@/lib/server/public-catalog'
import { formatCurrency } from '@/lib/utils'

export const dynamic = 'force-dynamic'
export default async function CoursePreview({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const course = await publicCourse(slug)
  if (!course) notFound()
  const next = `/learner/courses/${course.slug}`
  return (
    <div className="min-h-screen bg-[#faf9f6] text-navy">
      <LandingHeader />
      <main className="mx-auto max-w-[1100px] px-5 py-10 sm:px-8 sm:py-14">
        <Link href="/catalog" className="text-sm font-medium text-brand-700">
          Back to catalog
        </Link>
        <div className="mt-8 grid items-start gap-8 lg:grid-cols-[1.5fr_1fr]">
          <div>
            <p className="mb-3 text-sm text-brand-700">
              {course.category} · {course.level}
            </p>
            <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">{course.title}</h1>
            <p className="mt-6 whitespace-pre-wrap text-base leading-8 text-slate-600">
              {course.description}
            </p>
          </div>
          <aside className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
            {course.thumbnail && (
              <div className="relative aspect-video">
                <Image
                  src={course.thumbnail}
                  alt=""
                  fill
                  sizes="(max-width: 1024px) 100vw, 400px"
                  className="object-cover"
                />
              </div>
            )}
            <div className="p-6">
              <p className="text-2xl font-semibold">
                {Number(course.price) > 0 ? formatCurrency(Number(course.price)) : 'Free'}
              </p>
              <p className="mt-3 text-sm text-slate-500">
                {course.duration} {Number(course.duration) === 1 ? 'hour' : 'hours'} of learning
              </p>
              <Link
                href={next}
                className="mt-6 block rounded-xl bg-brand-600 px-5 py-3 text-center text-sm font-semibold text-white hover:bg-brand-700"
              >
                {Number(course.price) > 0 ? 'Continue to course' : 'Start learning'}
              </Link>
              <p className="mt-3 text-xs leading-5 text-slate-500">
                {Number(course.price) > 0
                  ? 'Payment is required before accessing this course.'
                  : 'Sign in or create an account to enroll and save your progress.'}
              </p>
            </div>
          </aside>
        </div>
      </main>
    </div>
  )
}
