'use client'
import { useState } from 'react'
import { useLms } from '@/lib/lms/store'
import type { Lesson } from '@/types'
import { inputClass, secondaryClass } from './common'

export function WorksheetEditor({ lesson }: { lesson: Lesson }) {
  const { execute } = useLms()
  const [saved, setSaved] = useState(lesson.worksheet || '')
  const [body, setBody] = useState(saved)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  async function save() {
    if (busy) return
    setBusy(true)
    setError('')
    setStatus('')
    try {
      await execute({ type: 'worksheet', lessonId: lesson.id, body, previous: saved })
      setSaved(body.trim())
      setBody(body.trim())
      setStatus(
        body.trim()
          ? 'Worksheet saved. Enrolled learners can now read and download it.'
          : 'Worksheet removed.',
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save worksheet.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <section className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <label htmlFor={`worksheet-${lesson.id}`} className="block font-semibold text-sm">
        Practice worksheet
      </label>
      <p className="text-sm text-slate-500">
        Optional practice tasks. Save separately; clear the field to remove.
      </p>
      <textarea
        id={`worksheet-${lesson.id}`}
        rows={7}
        maxLength={100000}
        className={inputClass}
        placeholder="Add the task, scenario, or practice questions."
        value={body}
        disabled={busy}
        onChange={(e) => {
          setBody(e.target.value)
          setStatus('')
        }}
      />
      <button
        type="button"
        className={secondaryClass}
        disabled={busy || body === saved}
        onClick={save}
      >
        {busy ? 'Saving…' : 'Save worksheet'}
      </button>
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      {status && (
        <p role="status" className="text-sm text-emerald-700">
          {status}
        </p>
      )}
    </section>
  )
}

export function LessonWorksheet({ lesson, courseTitle }: { lesson: Lesson; courseTitle: string }) {
  if (!lesson.worksheet?.trim())
    return (
      <p className="text-sm text-slate-500">
        Your tutor has not added a worksheet for this lesson yet.
      </p>
    )
  return (
    <div className="space-y-4">
      <h4 className="font-semibold">Lesson worksheet</h4>
      <p className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-600">
        {lesson.worksheet}
      </p>
      <p className="text-xs text-slate-500">Optional practice · No submission required.</p>
      <button
        type="button"
        className={secondaryClass}
        onClick={async () => {
          const { downloadText } = await import('@/lib/lms/store')
          downloadText(
            `${lesson.id}-worksheet.txt`,
            `${courseTitle}\n${lesson.title}\n\n${lesson.worksheet}\n`,
          )
        }}
      >
        Download worksheet (.txt)
      </button>
    </div>
  )
}
