export function CourseArtwork({ category, title }: { category: string; title?: string }) {
  return (
    <div
      aria-hidden="true"
      className="flex h-full w-full flex-col justify-center gap-3 bg-brand-50 p-6 text-navy"
    >
      <p className="text-xs font-medium text-brand-700">{category}</p>
      {title && <p className="line-clamp-3 text-xl font-semibold leading-snug">{title}</p>}
    </div>
  )
}
