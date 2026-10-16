'use client'
import { useEffect, useState } from 'react'
import { useLms } from '@/lib/lms/store'
import { inputClass } from './common'

export function LessonNotes({ lessonId, initial }: { lessonId: string; initial: string }) {
  const { execute } = useLms()
  const [draft, setDraft] = useState(initial)
  const [saved, setSaved] = useState(initial)
  const [status, setStatus] = useState('Saved to your account')
  useEffect(() => {
    if (draft === saved) return
    let active = true
    setStatus('Unsaved changes')
    const timer = setTimeout(() => {
      setStatus('Saving…')
      execute({ type: 'note', lessonId, body: draft })
        .then(() => {
          if (active) {
            setSaved(draft)
            setStatus('Saved to your account')
          }
        })
        .catch((e) => {
          if (active) setStatus(e.message)
        })
    }, 800)
    return () => {
      active = false
      clearTimeout(timer)
    }
    // execute refers to the provider's current record cache; draft controls this save.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, saved, lessonId])
  return (
    <>
      <textarea
        className={inputClass}
        rows={8}
        maxLength={20000}
        aria-label="Lesson notes"
        placeholder="What did you learn?"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <p role="status" className="text-xs text-slate-400 mt-2">
        {status}
      </p>
    </>
  )
}
