import Image from 'next/image'
import Link from 'next/link'
import { CourseArtwork } from '@/components/shared/CourseArtwork'
import { formatCurrency } from '@/lib/utils'
import type { publicCoursePage } from '@/lib/server/public-catalog'

export function PublicCourseCard({
  course,
}: {
  course: Awaited<ReturnType<typeof publicCoursePage>>['courses'][number]
}) {
  return (
    <Link
      prefetch={false}
      href={`/catalog/${course.slug}`}
      className="group overflow-hidden rounded-2xl border border-slate-200 bg-white transition-colors hover:border-brand-300 focus-visible:outline-brand-600"
    >
      <div className="relative aspect-video overflow-hidden">
        {course.thumbnail ? (
          <Image
            src={course.thumbnail}
            alt=""
            fill
            sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
            className="object-cover"
          />
        ) : (
          <CourseArtwork title={course.title} category={course.category} />
        )}
      </div>
      <div className="p-5">
        <p className="mb-2 text-xs font-medium text-brand-700">
          {course.category} · {course.level}
        </p>
        <h2 className="text-lg font-semibold text-navy group-hover:text-brand-700">
          {course.title}
        </h2>
        <p className="mt-2 line-clamp-2 text-sm leading-6 text-slate-500">{course.description}</p>
        <div className="mt-5 flex items-center justify-between gap-3 border-t border-slate-100 pt-4 text-sm">
          <span className="text-slate-500">
            {course.duration} {Number(course.duration) === 1 ? 'hour' : 'hours'}
          </span>
          <span className="font-semibold text-navy">
            {Number(course.price) > 0 ? formatCurrency(Number(course.price)) : 'Free'}
          </span>
        </div>
      </div>
    </Link>
  )
}
