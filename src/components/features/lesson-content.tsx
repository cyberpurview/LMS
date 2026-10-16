import { RICH_TEXT_PREFIX, sanitizeLessonHtml } from '@/lib/lms/rich-text'
export function LessonContent({ content, empty }: { content?: string; empty: string }) {
  if (!content) return <p className="text-sm text-slate-500">{empty}</p>
  if (!content.startsWith(RICH_TEXT_PREFIX))
    return <p className="lesson-reading whitespace-pre-wrap break-words">{content}</p>
  return (
    <div
      className="lesson-rich-text lesson-reading"
      dangerouslySetInnerHTML={{
        __html: sanitizeLessonHtml(content.slice(RICH_TEXT_PREFIX.length)),
      }}
    />
  )
}
