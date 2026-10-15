'use client'
import { useRef, useState } from 'react'
import {
  parseQuizImport,
  quizImportExample,
  QUIZ_IMPORT_MAX_BYTES,
  QUIZ_MAX_QUESTIONS,
} from '@/lib/lms/quiz-import'
import type { QuizQuestion } from '@/types'
import { Panel, secondaryClass, primaryClass, inputClass } from './common'

export function QuizQuestionImport({
  count,
  disabled,
  onImport,
}: {
  count: number
  disabled?: boolean
  onImport: (questions: QuizQuestion[]) => void
}) {
  const [pending, setPending] = useState<QuizQuestion[]>([])
  const [error, setError] = useState('')
  const [status, setStatus] = useState('')
  const [reading, setReading] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const generation = useRef(0)
  async function read(file?: File) {
    const version = ++generation.current
    setPending([])
    setError('')
    setStatus('')
    if (!file) {
      setReading(false)
      return
    }
    setReading(true)
    try {
      if (!file.name.toLowerCase().endsWith('.json')) throw new Error('Choose a .json file.')
      if (file.size > QUIZ_IMPORT_MAX_BYTES)
        throw new Error('Use a JSON file no larger than 256 KB.')
      const questions = parseQuizImport(await file.text())
      if (version !== generation.current) return
      if (count + questions.length > QUIZ_MAX_QUESTIONS)
        throw new Error(`This quiz already has ${count} questions. The total cannot exceed 100.`)
      setPending(questions)
    } catch (e) {
      if (version === generation.current)
        setError(e instanceof Error ? e.message : 'Unable to read this file.')
    } finally {
      if (version === generation.current) setReading(false)
    }
  }
  return (
    <Panel className="space-y-4">
      <details className="group">
        <summary className="cursor-pointer text-sm font-semibold">
          Import questions from JSON
        </summary>
        <div className="mt-4 space-y-4">
          <div>
            <p className="mt-1 text-sm text-slate-500">
              Up to 100 questions · 256 KB · Adds to existing questions.
            </p>
          </div>
          <p className="text-sm text-slate-600">
            Each question needs <code>text</code>, 2–10 <code>options</code>, and{' '}
            <code>correctAnswer</code> (1 means the first option). <code>explanation</code> is
            optional.
          </p>
          <button
            type="button"
            className={secondaryClass}
            onClick={async () => {
              const { downloadText } = await import('@/lib/lms/store')
              downloadText(
                'cyberpurview-quiz-template.json',
                JSON.stringify(quizImportExample, null, 2),
              )
            }}
          >
            Download sample JSON
          </button>
          <label className="block text-sm font-medium" htmlFor="quiz-json-file">
            JSON question file
          </label>
          <input
            ref={fileRef}
            id="quiz-json-file"
            type="file"
            accept=".json,application/json"
            disabled={disabled || reading}
            className={inputClass}
            onChange={(e) => void read(e.target.files?.[0])}
          />
          {reading && (
            <p role="status" className="text-sm text-slate-500">
              Checking questions…
            </p>
          )}
          {error && (
            <p role="alert" className="text-sm text-rose-600">
              {error}
            </p>
          )}
          {!!pending.length && (
            <div className="rounded-xl border border-brand-100 bg-brand-50 p-4 space-y-3">
              <p className="font-medium text-sm">
                {pending.length} valid questions ready to add · {count + pending.length} total
              </p>
              <ol className="list-decimal pl-5 text-sm text-slate-600 space-y-1">
                {pending.slice(0, 3).map((q) => (
                  <li key={q.id}>{q.text}</li>
                ))}
              </ol>
              {pending.length > 3 && (
                <p className="text-xs text-slate-500">And {pending.length - 3} more questions.</p>
              )}
              <button
                type="button"
                disabled={disabled || count + pending.length > QUIZ_MAX_QUESTIONS}
                className={primaryClass}
                onClick={() => {
                  if (count + pending.length > QUIZ_MAX_QUESTIONS) {
                    setError('The total cannot exceed 100 questions.')
                    return
                  }
                  onImport(pending)
                  setStatus(
                    `${pending.length} questions added. Review them below, then save the assessment.`,
                  )
                  setPending([])
                  if (fileRef.current) fileRef.current.value = ''
                }}
              >
                Add {pending.length} questions
              </button>
            </div>
          )}
          {status && (
            <p role="status" className="text-sm text-emerald-700">
              {status}
            </p>
          )}
        </div>
      </details>
    </Panel>
  )
}
