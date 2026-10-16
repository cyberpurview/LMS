'use client'
import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useSearchParams } from 'next/navigation'
import { useLms } from '@/lib/lms/store'
import type { QuizQuestion } from '@/types'
import { FeatureShell, Heading, Panel, Empty, secondaryClass } from './common'
import { QuizAnswerReview } from './quiz-answer-review'

type Attempt = {
  id: string
  quizId: string
  title: string
  startedAt: string
  score: number | null
  status: string
  canResume: boolean
}
type Result = {
  id: string
  title: string
  startedAt: string
  score: number | null
  passed: boolean
  completed: boolean
  feedbackAvailable: boolean
  questions: QuizQuestion[]
  answers: Record<string, string>
  feedback: { id: string; correctOptionId: string; explanation: string }[]
}
const date = (value: string) =>
  new Date(value).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })

export function QuizHistory() {
  const { execute } = useLms()
  const send = useRef(execute)
  send.current = execute
  const params = useSearchParams()
  const quizId = params.get('quiz') || undefined
  const attemptId = params.get('attempt') || undefined
  const [items, setItems] = useState<Attempt[]>([])
  const [result, setResult] = useState<Result | null>(null)
  const [more, setMore] = useState(false)
  const [busy, setBusy] = useState(true)
  const [error, setError] = useState('')
  const [retry, setRetry] = useState(0)
  const generation = useRef(0)
  const historyUrl = `/learner/quizzes/history${quizId ? `?quiz=${encodeURIComponent(quizId)}` : ''}`
  useEffect(() => {
    const current = ++generation.current
    setBusy(true)
    setError('')
    setResult(null)
    setItems([])
    async function load() {
      try {
        if (attemptId) {
          const value = (await send.current({ type: 'quizAttemptResult', attemptId })) as Result
          if (generation.current === current) setResult(value)
        } else {
          const value = (await send.current({ type: 'quizHistory', quizId })) as {
            items: Attempt[]
          }
          if (generation.current === current) {
            setItems(value.items.slice(0, 20))
            setMore(value.items.length > 20)
          }
        }
      } catch (cause) {
        if (generation.current === current)
          setError(cause instanceof Error ? cause.message : 'Unable to load history.')
      } finally {
        if (generation.current === current) setBusy(false)
      }
    }
    void load()
    return () => {
      generation.current = current + 1
    }
  }, [quizId, attemptId, retry])

  async function loadMore() {
    if (busy || !items.length) return
    const current = generation.current
    setBusy(true)
    setError('')
    try {
      const value = (await send.current({
        type: 'quizHistory',
        quizId,
        afterId: items[items.length - 1].id,
      })) as { items: Attempt[] }
      if (generation.current !== current) return
      setItems((previous) => [...previous, ...value.items.slice(0, 20)])
      setMore(value.items.length > 20)
    } catch (cause) {
      if (generation.current === current)
        setError(cause instanceof Error ? cause.message : 'Unable to load more attempts.')
    } finally {
      if (generation.current === current) setBusy(false)
    }
  }

  return (
    <FeatureShell role="learner" title="Attempt history">
      <Heading title={attemptId ? 'Attempt result' : 'Attempt history'}>
        <Link href={attemptId ? historyUrl : '/learner/quizzes'} className={secondaryClass}>
          {attemptId ? 'Back to history' : 'Back to quizzes'}
        </Link>
      </Heading>
      {error && (
        <Panel>
          <p role="alert" className="mb-3 text-sm text-rose-600">
            {error}
          </p>
          <button
            className={secondaryClass}
            onClick={() => (items.length ? void loadMore() : setRetry((value) => value + 1))}
            disabled={busy}
          >
            Try again
          </button>
        </Panel>
      )}
      {busy && !items.length && (
        <Panel>
          <p role="status" className="text-sm text-slate-500">
            Loading attempts…
          </p>
        </Panel>
      )}
      {!busy && !error && !attemptId && !items.length && (
        <Empty title="No attempts yet" description="Your quiz attempts will appear here." />
      )}
      {!attemptId && items.length > 0 && (
        <Panel>
          <ul className="divide-y divide-slate-100">
            {items.map((item) => (
              <li
                key={item.id}
                className="flex flex-wrap items-center justify-between gap-4 py-4 first:pt-0 last:pb-0"
              >
                <div className="min-w-0 flex-1">
                  <h2 className="font-semibold break-words">{item.title}</h2>
                  <p className="mt-1 text-sm text-slate-500">{date(item.startedAt)}</p>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  <span className="font-semibold">
                    {item.score === null ? '—' : `${item.score}%`}
                  </span>
                  <span
                    className={item.status === 'Passed' ? 'text-emerald-600' : 'text-slate-500'}
                  >
                    {item.status}
                  </span>
                  <Link
                    className={secondaryClass}
                    href={
                      item.canResume
                        ? `/learner/quizzes/${item.quizId}`
                        : `${historyUrl}${quizId ? '&' : '?'}attempt=${item.id}`
                    }
                  >
                    {item.canResume ? 'Resume' : 'View result'}
                  </Link>
                </div>
              </li>
            ))}
          </ul>
          {more && (
            <div className="mt-5 text-center">
              <button className={secondaryClass} disabled={busy} onClick={() => void loadMore()}>
                {busy ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </Panel>
      )}
      {result && (
        <>
          <Panel className="mb-5">
            <h2 className="text-xl font-semibold">{result.title}</h2>
            <p className="mt-1 text-sm text-slate-500">{date(result.startedAt)}</p>
            <p className="mt-4 text-lg font-semibold">
              {result.completed
                ? `${result.score}% · ${result.passed ? 'Passed' : 'Not passed'}`
                : 'In progress'}
            </p>
            {!result.feedbackAvailable && (
              <p className="mt-3 text-sm text-slate-500">
                Answer review is not available for this attempt.
              </p>
            )}
          </Panel>
          {result.feedbackAvailable && (
            <QuizAnswerReview
              key={result.id}
              questions={result.questions}
              answers={result.answers}
              feedback={result.feedback}
              score={result.score || 0}
              onViewResult={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            />
          )}
        </>
      )}
    </FeatureShell>
  )
}
