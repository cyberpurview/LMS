'use client'
import { useEffect, useRef, useState } from 'react'
import type { QuizQuestion } from '@/types'
import { Panel, secondaryClass } from './common'

type Feedback = { id: string; correctOptionId: string; explanation: string }
export function QuizAnswerReview({
  questions,
  answers,
  feedback,
  score,
  onViewResult,
}: {
  questions: QuizQuestion[]
  answers: Record<string, string>
  feedback: Feedback[]
  score: number
  onViewResult: () => void
}) {
  const [index, setIndex] = useState(0)
  const view = useRef<HTMLDivElement>(null)
  const moved = useRef(false)
  const reviews = questions.map((question) => {
    const answer = question.options.find((option) => option.id === answers[question.id])
    const detail = feedback.find((item) => item.id === question.id)
    const status = !answer
      ? 'Unanswered'
      : !detail
        ? 'Feedback unavailable'
        : answer.id === detail.correctOptionId
          ? 'Correct'
          : 'Incorrect'
    return { question, answer, detail, status }
  })
  useEffect(() => {
    if (!moved.current) return
    view.current?.focus({ preventScroll: true })
    view.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  }, [index])
  function select(next: number) {
    moved.current = true
    setIndex(next)
  }
  const selected = reviews[index]
  if (!selected) return null
  const { question, answer, detail, status } = selected
  const statusStyle = (value: string) =>
    value === 'Correct'
      ? 'bg-emerald-50 text-emerald-700'
      : value === 'Incorrect'
        ? 'bg-rose-50 text-rose-700'
        : 'bg-slate-100 text-slate-600'
  return (
    <section aria-label="Answer review">
      <div className="sticky top-20 z-10 mb-4 flex items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
        <h3 className="text-sm font-semibold">
          Answer review <span className="ml-2 text-slate-500">{score}%</span>
        </h3>
        <button type="button" className="text-sm font-medium text-brand-700" onClick={onViewResult}>
          View result
        </button>
      </div>
      <Panel className="mb-5">
        <dl className="grid grid-cols-3 gap-3">
          {['Correct', 'Incorrect', 'Unanswered'].map((label) => (
            <div key={label}>
              <dt className="text-xs text-slate-500">{label}</dt>
              <dd className="mt-1 text-xl font-semibold text-navy">
                {reviews.filter((item) => item.status === label).length}
              </dd>
            </div>
          ))}
        </dl>
        <details className="mt-4 border-t border-slate-100 pt-4">
          <summary className="cursor-pointer text-sm font-medium text-slate-600">
            Question navigator
          </summary>
          <nav
            aria-label="Review questions"
            className="mt-3 grid max-h-40 grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2 overflow-y-auto p-1"
          >
            {reviews.map((item, i) => (
              <button
                key={item.question.id}
                type="button"
                aria-label={`Review question ${i + 1}, ${item.status.toLowerCase()}`}
                aria-current={i === index ? 'step' : undefined}
                onClick={() => select(i)}
                className={`h-10 rounded-lg text-sm font-semibold ${statusStyle(item.status)} ${i === index ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}
              >
                {i + 1}
              </button>
            ))}
          </nav>
        </details>
      </Panel>
      <div
        ref={view}
        tabIndex={-1}
        aria-label={`Review question ${index + 1} of ${questions.length}`}
        className="scroll-mt-40 focus:outline-none"
      >
        <Panel>
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-slate-500">
              Question {index + 1} of {questions.length}
            </p>
            <span className={`rounded-full px-3 py-1 text-xs font-semibold ${statusStyle(status)}`}>
              {status}
            </span>
          </div>
          <h4 className="mb-5 text-lg font-semibold leading-7 text-navy">{question.text}</h4>
          <ol aria-label="Answer options" className="space-y-3">
            {question.options.map((option, i) => {
              const isSelected = option.id === answer?.id
              const isCorrect = option.id === detail?.correctOptionId
              const style = isCorrect
                ? 'border-emerald-200 bg-emerald-50'
                : isSelected && detail
                  ? 'border-rose-200 bg-rose-50'
                  : isSelected
                    ? 'border-brand-500 bg-brand-50'
                    : 'border-slate-200'
              return (
                <li
                  key={option.id}
                  className={`flex flex-col gap-2 rounded-xl border p-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 ${style}`}
                >
                  <div className="flex min-w-0 gap-3">
                    <span
                      aria-hidden="true"
                      className="text-sm font-semibold leading-6 text-slate-500"
                    >
                      {String.fromCharCode(65 + i)}.
                    </span>
                    <p className="text-sm leading-6 text-slate-800">{option.text}</p>
                  </div>
                  {(isSelected || isCorrect) && (
                    <div className="flex shrink-0 flex-wrap gap-2 text-xs font-medium leading-6">
                      {isSelected && <span className="text-slate-600">Your answer</span>}
                      {isCorrect && <span className="text-emerald-700">Correct answer</span>}
                    </div>
                  )}
                </li>
              )
            })}
          </ol>
          {detail?.explanation && (
            <div className="mt-5">
              <h5 className="mb-2 text-sm font-semibold text-navy">Explanation</h5>
              <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">
                {detail.explanation}
              </p>
            </div>
          )}
          <div className="mt-6 flex justify-between gap-3 border-t border-slate-100 pt-5">
            <button
              type="button"
              className={secondaryClass}
              disabled={index === 0}
              onClick={() => select(index - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              className={secondaryClass}
              disabled={index === questions.length - 1}
              onClick={() => select(index + 1)}
            >
              Next question
            </button>
          </div>
        </Panel>
      </div>
    </section>
  )
}
