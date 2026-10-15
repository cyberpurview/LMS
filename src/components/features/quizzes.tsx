'use client'
import { learnerCourseUrl } from '@/lib/lms/course-url'
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { Plus, Trash2 } from 'lucide-react'
import { useLms } from '@/lib/lms/store'
import { QuizQuestionImport } from './quiz-question-import'
import { QuizAnswerReview } from './quiz-answer-review'
import { QuizAttemptAccess } from './quiz-attempt-access'
import { CourseThumbnail } from './course-thumbnail'
import { AwardApproval } from './award-approval'
import { CERTIFICATE_MODES, CERTIFICATE_LABELS } from '@/lib/lms/award-rules'
import {
  quizAnswerCacheKey,
  restoreQuizAnswers,
  remainingQuizSeconds,
} from '@/lib/lms/quiz-session'
import { quizSchema } from '@/lib/lms/commands'
import {
  FeatureShell,
  Heading,
  Panel,
  Empty,
  Back,
  Field,
  inputClass,
  primaryClass,
  secondaryClass,
} from './common'
import { Badge, ProgressBar } from '@/components/shared/ui'
import type { Role, QuizQuestion } from '@/types'
import { formatCurrency } from '@/lib/utils'
export function QuizList({ role }: { role: Role }) {
  const { state, user: currentUser } = useLms()
  const courses = state.courses.filter((c) =>
    role === 'learner'
      ? state.enrollments.some((e) => e.courseId === c.id && e.learnerId === currentUser.id)
      : role === 'admin' || c.tutorId === currentUser.id,
  )
  const quizzes = state.quizzes.filter(
    (q) =>
      (courses.some((c) => c.id === q.courseId) ||
        (!q.courseId &&
          (role === 'learner' || role === 'admin' || q.creatorId === currentUser.id))) &&
      (role !== 'learner' || q.status !== 'draft'),
  )
  return (
    <FeatureShell role={role} title="Quizzes">
      <Heading title={role === 'learner' ? 'Your quizzes' : 'Quizzes'}>
        {role !== 'learner' && (
          <Link href={`/${role}/quizzes/new`} className={primaryClass}>
            <Plus className="w-4 h-4" />
            Create quiz
          </Link>
        )}
      </Heading>
      {!quizzes.length ? (
        <Empty title="No quizzes yet" description="Quizzes for your courses will appear here." />
      ) : (
        <div className="grid md:grid-cols-2 xl:grid-cols-3 gap-5">
          {quizzes.map((q) => {
            const course = courses.find((c) => c.id === q.courseId)
            const thumbnail = q.thumbnail || course?.thumbnail
            const attempts = state.attempts.filter(
              (a) => a.quizId === q.id && (role !== 'learner' || a.learnerId === currentUser.id),
            )
            const best =
              role === 'learner' && q.bestScore !== undefined
                ? q.bestScore
                : attempts.length
                  ? Math.max(...attempts.map((a) => a.score))
                  : null
            return (
              <Panel key={q.id}>
                <div className="relative aspect-video overflow-hidden rounded-xl bg-slate-100 mb-4">
                  {thumbnail ? (
                    <Image
                      src={thumbnail}
                      alt={`${q.title} thumbnail`}
                      fill
                      sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                      className="object-cover"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-slate-400">
                      Course assessment
                    </div>
                  )}
                </div>
                <Badge variant="info">{courses.find((c) => c.id === q.courseId)?.category}</Badge>
                {role !== 'learner' && (
                  <span className="ml-2">
                    <Badge variant={q.status === 'draft' ? 'warning' : 'success'}>
                      {q.status === 'draft' ? 'Draft' : 'Published'}
                    </Badge>
                  </span>
                )}
                <h3 className="font-semibold text-lg mt-4 mb-2">{q.title}</h3>
                {q.purpose === 'practice' && (
                  <span className="text-xs font-medium text-brand-700">
                    Practice · Unlimited attempts
                  </span>
                )}
                <p className="text-xs text-slate-400 mb-5">
                  {courses.find((c) => c.id === q.courseId)?.title || 'Standalone assessment'}
                </p>
                {!q.courseId && (
                  <p className="text-sm font-semibold mb-3">
                    {(q.price || 0) > 0 ? formatCurrency(q.price!) : 'Free'}
                  </p>
                )}
                <p className="text-sm text-slate-500 mb-4">
                  {q.questionCount ?? q.questions.length} questions · {q.timeLimit} min ·{' '}
                  {q.passingScore}% to pass
                </p>
                {role === 'learner' && q.purpose !== 'practice' && q.attemptsRemaining != null && (
                  <p className="mb-4 text-sm text-slate-500">
                    {q.attemptsRemaining} of {q.attemptLimit ?? q.maxAttempts} attempts remaining
                  </p>
                )}
                {best !== null && (
                  <p className="text-sm text-emerald-600 mb-4">
                    {role === 'learner'
                      ? `Your best score: ${best}%`
                      : `${attempts.length} attempts recorded`}
                  </p>
                )}
                <Link
                  href={`/${role}/quizzes/${q.id}${role === 'learner' ? '' : '/edit'}`}
                  className={`${secondaryClass} w-full`}
                >
                  {role === 'learner'
                    ? !q.courseId && (q.price || 0) > 0 && q.hasAccess !== true
                      ? 'View assessment'
                      : q.inProgress
                        ? 'Resume assessment'
                        : q.attemptsRemaining === 0 ||
                            (q.retryAvailableAt && Date.parse(q.retryAvailableAt) > Date.now())
                          ? 'View assessment'
                          : best === null
                            ? 'Start assessment'
                            : 'Take again'
                    : q.editLocked
                      ? 'View assessment'
                      : q.status === 'draft'
                        ? 'Continue draft'
                        : 'Edit assessment'}
                </Link>
              </Panel>
            )
          })}
        </div>
      )}
      {role !== 'learner' && (
        <Panel className="mt-6">
          <h3 className="font-semibold mb-4">Recent submissions</h3>
          {state.attempts
            .filter((a) => quizzes.some((q) => q.id === a.quizId))
            .map((a) => (
              <div
                key={a.id}
                className="flex flex-wrap gap-3 justify-between border-t border-slate-100 py-4 text-sm"
              >
                <span>
                  {state.users.find((u) => u.id === a.learnerId)?.name} ·{' '}
                  {quizzes.find((q) => q.id === a.quizId)?.title}
                </span>
                <Badge variant={a.passed ? 'success' : 'warning'}>
                  {a.score}% · {a.passed ? 'Passed' : 'Needs practice'}
                </Badge>
              </div>
            ))}
        </Panel>
      )}
    </FeatureShell>
  )
}
export function QuizRunner({ id }: { id: string }) {
  const { state, execute, notice, user: currentUser } = useLms()
  const quiz = state.quizzes.find((q) => q.id === id && q.status !== 'draft')
  const paymentRequired =
    !!quiz && !quiz.courseId && (quiz.price || 0) > 0 && quiz.hasAccess !== true
  const enrollment =
    state.enrollments.find(
      (e) => e.courseId === quiz?.courseId && e.learnerId === currentUser.id,
    ) ||
    (quiz && !quiz.courseId
      ? {
          progress: 0,
          certificateIssued: state.certificates.some((c) => c.quizId === quiz.id),
          completedAt: undefined,
          passedAssessments: 0,
          totalAssessments: 0,
        }
      : undefined)
  const [answers, setAnswers] = useState<Record<string, string>>({})
  const [result, setResult] = useState<number | null>(null)
  const [feedbackReleased, setFeedbackReleased] = useState(true)
  const [attemptInfo, setAttemptInfo] = useState<{
    attemptsUsed?: number
    attemptLimit?: number | null
    attemptsRemaining?: number | null
    retryAvailableAt?: string | null
  }>({})
  const [policyNow, setPolicyNow] = useState(Date.now())
  const policy = attemptInfo.attemptsUsed !== undefined ? attemptInfo : quiz
  const retryAvailableAt = policy?.retryAvailableAt || null
  const coolingDown = !!retryAvailableAt && Date.parse(retryAvailableAt) > policyNow
  const exhausted = policy?.attemptsRemaining === 0
  useEffect(() => {
    setAttemptInfo({
      attemptsUsed: quiz?.attemptsUsed,
      attemptLimit: quiz?.attemptLimit,
      attemptsRemaining: quiz?.attemptsRemaining,
      retryAvailableAt: quiz?.retryAvailableAt,
    })
  }, [quiz?.attemptsUsed, quiz?.attemptLimit, quiz?.attemptsRemaining, quiz?.retryAvailableAt])
  const [started, setStarted] = useState(false)
  const [remaining, setRemaining] = useState((quiz?.timeLimit || 10) * 60)
  const [attemptId, setAttemptId] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [starting, setStarting] = useState(false)
  const [submitError, setSubmitError] = useState('')
  const [cacheAvailable, setCacheAvailable] = useState(true)
  const [activeQuestion, setActiveQuestion] = useState(0)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const confirmDialog = useRef<HTMLDialogElement>(null)
  const questionView = useRef<HTMLDivElement>(null)
  const resultSummary = useRef<HTMLDivElement>(null)
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const deadline = useRef(0)
  const retryAt = useRef(0)
  const pending = useRef({ start: false, submit: false })
  const submitLatest = useRef<(automatic?: boolean) => Promise<void>>(async () => {})
  const [feedback, setFeedback] = useState<
    { id: string; correctOptionId: string; explanation: string }[]
  >([])
  async function begin() {
    if (!quiz || paymentRequired || pending.current.start) return
    pending.current.start = true
    setStarting(true)
    setSubmitError('')
    const requestedAt = performance.now()
    try {
      const data = (await execute({ type: 'startQuiz', quizId: quiz.id })) as {
        id: string
        deadline: string
        serverTime?: string
        attemptsUsed?: number
        attemptLimit?: number | null
        attemptsRemaining?: number | null
        retryAvailableAt?: string | null
      }
      const receivedAt = performance.now()
      const budget =
        Date.parse(data.deadline) - Date.parse(data.serverTime || new Date().toISOString())
      if (!Number.isFinite(budget))
        throw new Error('Assessment timing could not be verified. Try again.')
      deadline.current = receivedAt + Math.max(0, budget - (receivedAt - requestedAt))
      retryAt.current = 0
      let restored: Record<string, string> = {}
      try {
        restored = restoreQuizAnswers(
          sessionStorage.getItem(quizAnswerCacheKey(currentUser.id, data.id)),
          quiz.questions,
        )
      } catch {
        setCacheAvailable(false)
      }
      setAnswers(restored)
      setAttemptInfo(data)
      setActiveQuestion(0)
      setAttemptId(data.id)
      setRemaining(remainingQuizSeconds(deadline.current, receivedAt))
      setStarted(true)
    } catch (e) {
      notice(e instanceof Error ? e.message : 'Unable to start assessment')
    } finally {
      pending.current.start = false
      setStarting(false)
    }
  }
  async function submit(automatic = false) {
    if (
      !attemptId ||
      result !== null ||
      pending.current.submit ||
      (automatic && performance.now() < retryAt.current)
    )
      return
    pending.current.submit = true
    if (timerRef.current !== null) clearInterval(timerRef.current)
    timerRef.current = null
    setRemaining(remainingQuizSeconds(deadline.current, performance.now()))
    setConfirmOpen(false)
    setSubmitError('')
    setSubmitting(true)
    try {
      const data = (await execute({ type: 'submitQuiz', attemptId, answers })) as {
        score: number
        feedback: typeof feedback
        answers?: Record<string, string>
        feedbackAvailable?: boolean
        attemptsUsed?: number
        attemptLimit?: number | null
        attemptsRemaining?: number | null
        retryAvailableAt?: string | null
      }
      setFeedback(data.feedback)
      setFeedbackReleased(data.feedbackAvailable !== false)
      setAttemptInfo(data)
      setPolicyNow(Date.now())
      if (data.answers)
        setAnswers(restoreQuizAnswers(JSON.stringify(data.answers), quiz?.questions || []))
      setResult(data.score)
      setSubmitError('')
      try {
        sessionStorage.removeItem(quizAnswerCacheKey(currentUser.id, attemptId))
      } catch {}
    } catch (e) {
      const status = (e as { status?: number })?.status
      retryAt.current =
        status === 401 || status === 403
          ? Infinity
          : performance.now() + (status === 429 ? 300000 : 30000)
      setSubmitError(e instanceof Error ? e.message : 'Unable to submit assessment')
    } finally {
      pending.current.submit = false
      setSubmitting(false)
    }
  }
  useEffect(() => {
    submitLatest.current = submit
  })
  useEffect(() => {
    if (!retryAvailableAt || Date.parse(retryAvailableAt) <= Date.now()) return
    const timer = setInterval(() => {
      setPolicyNow(Date.now())
      if (Date.parse(retryAvailableAt) <= Date.now()) clearInterval(timer)
    }, 1000)
    return () => clearInterval(timer)
  }, [retryAvailableAt])
  async function viewLastResult() {
    if (!quiz || starting) return
    setStarting(true)
    try {
      const data = (await execute({ type: 'quizResult', quizId: quiz.id })) as {
        id: string
        score: number
        answers: Record<string, string>
        feedback: typeof feedback
        feedbackAvailable: boolean
        attemptsUsed?: number
        attemptLimit?: number | null
        attemptsRemaining?: number | null
        retryAvailableAt?: string | null
      }
      setAttemptId(data.id)
      setAnswers(restoreQuizAnswers(JSON.stringify(data.answers), quiz.questions))
      setFeedback(data.feedback)
      setFeedbackReleased(data.feedbackAvailable)
      setAttemptInfo(data)
      setResult(data.score)
      setStarted(true)
      setPolicyNow(Date.now())
    } catch (e) {
      notice(e instanceof Error ? e.message : 'Unable to load your result.')
    } finally {
      setStarting(false)
    }
  }
  useEffect(() => {
    if (!started || result !== null || submitting) return
    const tick = () => {
      if (pending.current.submit) return
      const left = remainingQuizSeconds(deadline.current, performance.now())
      setRemaining(left)
      if (left === 0) void submitLatest.current(true)
    }
    const timer = setInterval(tick, 250)
    timerRef.current = timer
    tick()
    return () => {
      clearInterval(timer)
      if (timerRef.current === timer) timerRef.current = null
    }
  }, [started, result, attemptId, submitting])
  useEffect(() => {
    const dialog = confirmDialog.current
    if (confirmOpen && started && result === null && !submitting) dialog?.showModal?.()
    else if (dialog?.open) dialog.close()
  }, [confirmOpen, started, result, submitting])
  useEffect(() => {
    if (!started || result !== null) return
    questionView.current?.focus({ preventScroll: true })
    questionView.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  }, [activeQuestion, started, result])
  useEffect(() => {
    if (result === null) return
    resultSummary.current?.focus({ preventScroll: true })
    resultSummary.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
  }, [result])
  if (!quiz || !enrollment)
    return (
      <FeatureShell role="learner" title="Assessment">
        <Empty
          title="Assessment unavailable"
          description="Enroll in the course before taking its assessment."
          href="/learner/catalog"
        />
      </FeatureShell>
    )
  const answeredCount = quiz.questions.filter((q) =>
    q.options.some((option) => option.id === answers[q.id]),
  ).length
  const unansweredCount = quiz.questions.length - answeredCount
  const question = quiz.questions[activeQuestion]
  const certificateIssued = quiz.purpose !== 'practice' && enrollment.certificateIssued
  const attemptLabel =
    quiz.purpose === 'practice'
      ? 'Practice · Unlimited attempts'
      : policy?.attemptsRemaining != null
        ? `${policy.attemptsRemaining} of ${policy.attemptLimit ?? quiz.maxAttempts} attempts remaining`
        : 'Unlimited attempts'
  return (
    <FeatureShell role="learner" title="Assessment">
      <Back href="/learner/quizzes" label="Back to assessments" />
      <div className="max-w-3xl mx-auto">
        <Heading
          title={quiz.title}
          description={`${quiz.questionCount ?? quiz.questions.length} questions · ${quiz.timeLimit} minutes · ${quiz.passingScore}% to pass`}
        />
        {!started ? (
          <Panel>
            {(quiz.thumbnail || state.courses.find((c) => c.id === quiz.courseId)?.thumbnail) && (
              <div className="relative aspect-video overflow-hidden rounded-xl mb-5">
                <Image
                  src={
                    quiz.thumbnail || state.courses.find((c) => c.id === quiz.courseId)!.thumbnail
                  }
                  alt={`${quiz.title} thumbnail`}
                  fill
                  sizes="(max-width: 768px) 100vw, 720px"
                  className="object-cover"
                />
              </div>
            )}
            <h3 className="text-xl font-semibold mb-3">Before you start</h3>
            <p className="text-sm text-slate-500 leading-6 mb-5">
              Choose one answer per question. The quiz submits automatically when time runs out.
            </p>
            <p className="mb-4 text-sm font-medium text-slate-600">{attemptLabel}</p>
            {coolingDown && !quiz.inProgress && (
              <p className="mb-4 text-sm text-slate-500">
                Next attempt: {new Date(retryAvailableAt!).toLocaleString()}
              </p>
            )}
            {paymentRequired ? (
              <div className="space-y-3">
                <p className="font-semibold">{formatCurrency(quiz.price!)} · One-time purchase</p>
                <button className={primaryClass} disabled>
                  Payments coming soon
                </button>
              </div>
            ) : (
              <div className="flex flex-wrap gap-3">
                <button
                  className={primaryClass}
                  disabled={starting || (!quiz.inProgress && (exhausted || coolingDown))}
                  onClick={begin}
                >
                  {starting
                    ? 'Loading…'
                    : quiz.inProgress
                      ? 'Resume assessment'
                      : exhausted
                        ? 'Attempt limit reached'
                        : quiz.purpose === 'practice'
                          ? 'Start practice'
                          : 'Start assessment'}
                </button>
                {(policy?.attemptsUsed || 0) > (quiz.inProgress ? 1 : 0) && (
                  <button
                    className={secondaryClass}
                    disabled={starting}
                    onClick={() => void viewLastResult()}
                  >
                    View last result
                  </button>
                )}
              </div>
            )}
          </Panel>
        ) : result !== null ? (
          <>
            <div
              ref={resultSummary}
              tabIndex={-1}
              aria-label="Assessment result"
              className="scroll-mt-24 focus:outline-none"
            >
              <Panel className="text-center mb-6">
                <p className="text-4xl font-bold mb-3">{result}%</p>
                <h3 className="text-xl font-semibold">
                  {quiz.purpose === 'practice'
                    ? 'Practice complete'
                    : result >= quiz.passingScore
                      ? 'Assessment passed'
                      : 'Assessment not passed'}
                </h3>
                <p className="text-sm text-slate-500 my-4">
                  {certificateIssued ? 'Your certificate is ready.' : 'Your result is saved.'}
                </p>
                <p className="mb-4 text-sm text-slate-500">{attemptLabel}</p>
                {coolingDown && (
                  <p className="mb-4 text-sm text-slate-500">
                    Next attempt: {new Date(retryAvailableAt!).toLocaleString()}
                  </p>
                )}
                <div className="flex flex-wrap justify-center gap-3">
                  {quiz.purpose !== 'practice' &&
                    !quiz.courseId &&
                    quiz.certificateRule !== 'none' &&
                    quiz.certificateMode !== 'none' &&
                    quiz.certificateMode !== 'approval' &&
                    !enrollment.certificateIssued && (
                      <button
                        className={primaryClass}
                        onClick={async () => {
                          try {
                            await execute({
                              type: 'award',
                              action: 'claim',
                              kind: 'quiz',
                              subjectId: quiz.id,
                            })
                            notice('Your certificate is ready.')
                          } catch (e) {
                            notice(e instanceof Error ? e.message : 'Certificate unavailable')
                          }
                        }}
                      >
                        Get certificate
                      </button>
                    )}
                  <button
                    className={secondaryClass}
                    disabled={exhausted || coolingDown}
                    onClick={() => {
                      setAnswers({})
                      setResult(null)
                      setStarted(false)
                      setAttemptId('')
                      setFeedback([])
                      setFeedbackReleased(true)
                      setActiveQuestion(0)
                      setConfirmOpen(false)
                      setSubmitError('')
                      deadline.current = 0
                      retryAt.current = 0
                      setRemaining(quiz.timeLimit * 60)
                    }}
                  >
                    {exhausted
                      ? 'Attempt limit reached'
                      : quiz.purpose === 'practice'
                        ? 'Practice again'
                        : 'Try again'}
                  </button>
                  <Link
                    className={primaryClass}
                    href={
                      certificateIssued
                        ? `/learner/certificates/${quiz.courseId ? 'course' : 'quiz'}/${quiz.courseId || quiz.id}`
                        : enrollment.progress === 100
                          ? learnerCourseUrl(
                              state.courses.find((c) => c.id === quiz.courseId) || {
                                id: quiz.courseId,
                              },
                              '#course-assessments',
                            )
                          : !quiz.courseId
                            ? '/learner/quizzes'
                            : learnerCourseUrl(
                                state.courses.find((c) => c.id === quiz.courseId) || {
                                  id: quiz.courseId,
                                },
                                '/learn',
                              )
                    }
                  >
                    {certificateIssued
                      ? 'View certificate'
                      : enrollment.progress === 100
                        ? 'View course progress'
                        : !quiz.courseId
                          ? 'Back to quizzes'
                          : 'Back to learning'}
                  </Link>
                </div>
              </Panel>
            </div>
            {feedbackReleased ? (
              <QuizAnswerReview
                questions={quiz.questions}
                answers={answers}
                feedback={feedback}
                score={result}
                onViewResult={() => {
                  resultSummary.current?.focus({ preventScroll: true })
                  resultSummary.current?.scrollIntoView?.({ block: 'start', behavior: 'instant' })
                }}
              />
            ) : (
              <Panel>
                <h3 className="font-semibold">Answer review</h3>
                <p className="mt-2 text-sm text-slate-500">
                  {policy?.attemptLimit == null
                    ? 'Correct answers unlock after you pass.'
                    : 'Correct answers unlock after you pass or use your final attempt.'}
                </p>
              </Panel>
            )}
          </>
        ) : (
          <>
            <Panel className="mb-5 sticky top-20 z-10">
              <div className="flex flex-wrap justify-between gap-3 text-sm mb-3">
                <span>
                  {answeredCount} answered · {unansweredCount} unanswered
                </span>
                <span
                  role="timer"
                  aria-label="Assessment time remaining"
                  className="font-semibold tabular-nums"
                >
                  {submitting
                    ? 'Submitting…'
                    : `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')} remaining`}
                </span>
              </div>
              <ProgressBar
                value={quiz.questions.length ? (answeredCount / quiz.questions.length) * 100 : 0}
              />
              {!cacheAvailable && (
                <p className="mt-3 text-xs text-amber-700">
                  Your browser could not save selections. Keep this tab open until you submit.
                </p>
              )}
            </Panel>
            <Panel className="mb-5">
              <details>
                <summary className="cursor-pointer text-sm font-medium text-slate-600">
                  Question navigator
                </summary>
                <nav
                  aria-label="Assessment questions"
                  className="mt-3 grid max-h-40 grid-cols-[repeat(auto-fill,minmax(2.5rem,1fr))] gap-2 overflow-y-auto p-1"
                >
                  {quiz.questions.map((q, i) => (
                    <button
                      key={q.id}
                      type="button"
                      disabled={submitting}
                      aria-current={activeQuestion === i ? 'step' : undefined}
                      aria-label={`Question ${i + 1}, ${answers[q.id] ? 'answered' : 'unanswered'}`}
                      onClick={() => setActiveQuestion(i)}
                      className={`h-10 rounded-lg border text-sm font-semibold ${answers[q.id] ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'} ${activeQuestion === i ? 'ring-2 ring-brand-500 ring-offset-2' : ''}`}
                    >
                      {i + 1}
                    </button>
                  ))}
                </nav>
              </details>
            </Panel>
            {question && (
              <div
                ref={questionView}
                tabIndex={-1}
                aria-label={`Question ${activeQuestion + 1} of ${quiz.questions.length}`}
                className="scroll-mt-52 focus:outline-none"
              >
                <Panel key={question.id} className="mb-5">
                  <p className="mb-4 text-sm text-slate-500">
                    Question {activeQuestion + 1} of {quiz.questions.length}
                  </p>
                  <fieldset disabled={submitting || remaining === 0}>
                    <legend className="text-base font-semibold leading-7 mb-5">
                      {question.text}
                    </legend>
                    <div className="space-y-3">
                      {question.options.map((o) => (
                        <label
                          key={o.id}
                          className={`flex gap-3 p-4 rounded-xl border cursor-pointer text-sm ${answers[question.id] === o.id ? 'border-brand-500 bg-brand-50 text-brand-800' : 'border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                        >
                          <input
                            type="radio"
                            name={question.id}
                            value={o.id}
                            checked={answers[question.id] === o.id}
                            onChange={() => {
                              if (
                                pending.current.submit ||
                                remainingQuizSeconds(deadline.current, performance.now()) === 0
                              )
                                return
                              const next = { ...answers, [question.id]: o.id }
                              setAnswers(next)
                              try {
                                sessionStorage.setItem(
                                  quizAnswerCacheKey(currentUser.id, attemptId),
                                  JSON.stringify(next),
                                )
                              } catch {
                                setCacheAvailable(false)
                              }
                            }}
                          />
                          {o.text}
                        </label>
                      ))}
                    </div>
                  </fieldset>
                  <div className="mt-6 flex justify-between gap-3 border-t border-slate-100 pt-5">
                    <button
                      type="button"
                      className={secondaryClass}
                      disabled={submitting || activeQuestion === 0}
                      onClick={() => setActiveQuestion((i) => i - 1)}
                    >
                      Previous
                    </button>
                    <button
                      type="button"
                      className={secondaryClass}
                      disabled={submitting || activeQuestion === quiz.questions.length - 1}
                      onClick={() => setActiveQuestion((i) => i + 1)}
                    >
                      Next question
                    </button>
                  </div>
                </Panel>
              </div>
            )}
            <button
              className={`${primaryClass} w-full`}
              disabled={submitting}
              onClick={() => (remaining === 0 ? void submit() : setConfirmOpen(true))}
            >
              {submitting
                ? 'Submitting…'
                : remaining === 0
                  ? 'Retry submission'
                  : 'Submit assessment'}
            </button>
            <dialog
              ref={confirmDialog}
              aria-labelledby="confirm-quiz-title"
              onCancel={() => setConfirmOpen(false)}
              onClose={() => setConfirmOpen(false)}
              className="w-[calc(100%-2rem)] max-w-md rounded-2xl border border-slate-200 bg-white p-6 text-navy shadow-xl backdrop:bg-navy/40"
            >
              <h2 id="confirm-quiz-title" className="text-xl font-semibold">
                Submit assessment?
              </h2>
              <p className="mt-3 text-sm leading-6 text-slate-600">
                {answeredCount} of {quiz.questions.length} questions answered.
                {unansweredCount > 0
                  ? ` ${unansweredCount} ${unansweredCount === 1 ? 'question is' : 'questions are'} unanswered and will receive no credit.`
                  : ''}{' '}
                You cannot change your answers after submitting.
              </p>
              <div className="mt-6 flex flex-wrap justify-end gap-3">
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={() => setConfirmOpen(false)}
                >
                  Keep answering
                </button>
                <button
                  type="button"
                  className={primaryClass}
                  disabled={submitting}
                  onClick={() => void submit()}
                >
                  Confirm submission
                </button>
              </div>
            </dialog>
            {submitError && (
              <p role="alert" className="mt-4 text-sm text-rose-600">
                {submitError} Your selections are still here. Retry submission, or sign in again if
                your session expired.
              </p>
            )}
          </>
        )}
      </div>
    </FeatureShell>
  )
}
export function QuizEditor({ role, id }: { role: Role; id?: string }) {
  const { state, execute, notice, user: currentUser, ready: optionsReady = true } = useLms()
  const router = useRouter()
  const courses = state.courses.filter((c) => role === 'admin' || c.tutorId === currentUser.id)
  const existing = state.quizzes.find(
    (q) =>
      q.id === id &&
      (courses.some((c) => c.id === q.courseId) ||
        (!q.courseId && (role === 'admin' || q.creatorId === currentUser.id))),
  )
  const [title, setTitle] = useState(existing?.title || '')
  const [courseId, setCourseId] = useState(existing ? existing.courseId : courses[0]?.id || '')
  const [purpose, setPurpose] = useState<'practice' | 'assessment'>(
    existing?.purpose || 'assessment',
  )
  const [maxAttempts, setMaxAttempts] = useState<number | null>(
    existing ? (existing.maxAttempts ?? null) : 3,
  )
  const [retryDelay, setRetryDelay] = useState(existing?.retryDelayMinutes || 0)
  const [feedbackPolicy, setFeedbackPolicy] = useState<'immediate' | 'after_pass_or_last'>(
    existing?.feedbackPolicy || (existing ? 'immediate' : 'after_pass_or_last'),
  )
  const [passing, setPassing] = useState(existing?.passingScore || 70)
  const [certificateRule, setCertificateRule] = useState(existing?.certificateRule || 'none')
  const [certificateMode, setCertificateMode] = useState(existing?.certificateMode || 'automatic')
  const [time, setTime] = useState(existing?.timeLimit || 20)
  const [price, setPrice] = useState(existing?.price || 0)
  const [paid, setPaid] = useState((existing?.price || 0) > 0)
  const [questions, setQuestions] = useState<QuizQuestion[]>(existing?.questions || [])
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [quizId] = useState(id || crypto.randomUUID())
  const [thumbnail, setThumbnail] = useState(existing?.thumbnail || '')
  const [customThumbnail, setCustomThumbnail] = useState(!!existing?.thumbnail)
  const [uploadingThumbnail, setUploadingThumbnail] = useState(false)
  const selectedCourse = courses.find((c) => c.id === courseId)
  const locked = !!existing?.editLocked
  async function save(status: 'draft' | 'published') {
    if (saving || locked || uploadingThumbnail) return
    setSaveError('')
    if (!courseId && paid && price <= 0) {
      setSaveError('Enter a price greater than zero for a paid quiz.')
      return
    }
    const quiz = {
      id: quizId,
      courseId,
      purpose,
      maxAttempts: purpose === 'practice' ? null : maxAttempts,
      retryDelayMinutes: purpose === 'practice' ? 0 : retryDelay,
      feedbackPolicy: purpose === 'practice' ? 'immediate' : feedbackPolicy,
      price: !courseId && paid ? price : 0,
      certificateRule: purpose === 'practice' || courseId ? 'none' : certificateRule,
      certificateMode: purpose === 'practice' ? 'none' : certificateMode,
      thumbnail: customThumbnail ? thumbnail : '',
      title,
      passingScore: passing,
      timeLimit: time,
      questions,
      status,
      version: existing?.version,
    }
    const parsed = quizSchema.safeParse(quiz)
    if (!parsed.success) {
      setSaveError(parsed.error.issues[0]?.message || 'Complete the assessment fields.')
      return
    }
    setSaving(true)
    try {
      await execute({ type: 'saveQuiz', quiz: parsed.data })
      notice(status === 'draft' ? 'Draft saved. Learners cannot see it.' : 'Assessment published.')
      router.push(`/${role}/quizzes`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to save assessment.')
    } finally {
      setSaving(false)
    }
  }
  async function copyDraft() {
    if (saving || !existing) return
    setSaving(true)
    setSaveError('')
    try {
      const copyId = crypto.randomUUID()
      const copied = existing.questions.map((q) => {
        const options = q.options.map((o) => ({ ...o, id: crypto.randomUUID() }))
        return {
          ...q,
          id: crypto.randomUUID(),
          options,
          correctOptionId:
            options[q.options.findIndex((o) => o.id === q.correctOptionId)]?.id || '',
        }
      })
      await execute({
        type: 'saveQuiz',
        quiz: {
          id: copyId,
          courseId: existing.courseId,
          purpose: existing.purpose || 'assessment',
          maxAttempts: existing.maxAttempts ?? null,
          retryDelayMinutes: existing.retryDelayMinutes || 0,
          feedbackPolicy: existing.feedbackPolicy || 'immediate',
          price: existing.price || 0,
          certificateRule: existing.certificateRule || 'none',
          certificateMode: existing.certificateMode || 'automatic',
          thumbnail: existing.thumbnail || '',
          title: `${existing.title.slice(0, 187)} (draft copy)`,
          status: 'draft',
          passingScore: existing.passingScore,
          timeLimit: existing.timeLimit,
          questions: copied,
        },
      })
      notice('A separate draft was created. Original questions and results are preserved.')
      router.push(`/${role}/quizzes/${copyId}/edit`)
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Unable to create a draft copy.')
    } finally {
      setSaving(false)
    }
  }
  function change(qid: string, patch: Partial<QuizQuestion>) {
    setQuestions((qs) => qs.map((q) => (q.id === qid ? { ...q, ...patch } : q)))
  }
  if (id && !existing)
    return (
      <FeatureShell role={role} title="Quiz editor">
        <Empty title="Quiz unavailable" href={`/${role}/quizzes`} />
      </FeatureShell>
    )
  return (
    <FeatureShell role={role} title="Quiz editor">
      <Back href={`/${role}/quizzes`} label="Back to quizzes" />
      <Heading
        title={locked ? 'View assessment' : id ? 'Edit assessment' : 'Create an assessment'}
      />
      <div className="mb-5">
        <Badge variant={existing?.status === 'published' ? 'success' : 'warning'}>
          {existing?.status === 'published' ? 'Published' : 'Draft'}
        </Badge>
        {locked && (
          <div className="mt-3 rounded-xl bg-amber-50 p-4 text-sm text-amber-800 space-y-3">
            <p>
              Locked because a learner has started or purchased it. Create a draft copy to make
              changes.
            </p>
            <button type="button" disabled={saving} className={secondaryClass} onClick={copyDraft}>
              {saving ? 'Creating copy…' : 'Create draft copy'}
            </button>
          </div>
        )}
        {saveError && (
          <p role="alert" className="mt-3 text-sm text-rose-600">
            {saveError}
          </p>
        )}
      </div>
      <form
        className="w-full min-w-0 space-y-6"
        onSubmit={(e) => {
          e.preventDefault()
          void save('published')
        }}
      >
        <fieldset disabled={saving || locked} className="min-w-0 space-y-6">
          <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 items-start">
            <Panel className="xl:col-span-7 min-w-0">
              <h3 className="font-semibold mb-5">Assessment settings</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
                <Field label="Assessment title" className="sm:col-span-2">
                  <input
                    required
                    className={inputClass}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                  />
                </Field>
                <Field label="Course" className="sm:col-span-2">
                  <select
                    className={inputClass}
                    value={courseId}
                    disabled={!!existing || uploadingThumbnail}
                    onChange={(e) => {
                      setCourseId(e.target.value)
                      setPrice(0)
                      setPaid(false)
                      setThumbnail('')
                      setCustomThumbnail(false)
                    }}
                  >
                    <option value="">Standalone quiz (no course)</option>
                    {!optionsReady && !courses.length && <option disabled>Loading courses…</option>}
                    {courseId && !courses.some((c) => c.id === courseId) && (
                      <option value={courseId} disabled>
                        Selected course unavailable
                      </option>
                    )}
                    {courses.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.title}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Quiz purpose" className="sm:col-span-2">
                  <select
                    className={inputClass}
                    value={purpose}
                    onChange={(e) => setPurpose(e.target.value as typeof purpose)}
                  >
                    <option value="assessment">Assessment</option>
                    <option value="practice">Practice — unlimited attempts, no certificate</option>
                  </select>
                </Field>
                {purpose === 'assessment' && (
                  <>
                    <Field label="Attempt limit">
                      <select
                        className={inputClass}
                        value={maxAttempts === null ? 'unlimited' : 'limited'}
                        onChange={(e) => setMaxAttempts(e.target.value === 'unlimited' ? null : 3)}
                      >
                        <option value="limited">Limited attempts</option>
                        <option value="unlimited">Unlimited attempts</option>
                      </select>
                    </Field>
                    {maxAttempts !== null && (
                      <Field label="Maximum attempts">
                        <input
                          className={inputClass}
                          type="number"
                          min={1}
                          max={1000}
                          value={maxAttempts}
                          onChange={(e) => setMaxAttempts(Number(e.target.value))}
                        />
                      </Field>
                    )}
                    <Field label="Wait between attempts (minutes)">
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        max={10080}
                        value={retryDelay}
                        onChange={(e) => setRetryDelay(Number(e.target.value))}
                      />
                    </Field>
                    <Field label="Reveal correct answers">
                      <select
                        className={inputClass}
                        value={feedbackPolicy}
                        onChange={(e) => setFeedbackPolicy(e.target.value as typeof feedbackPolicy)}
                      >
                        <option value="after_pass_or_last">
                          After passing or the final attempt
                        </option>
                        <option value="immediate">After each submission</option>
                      </select>
                    </Field>
                  </>
                )}
                {!courseId && (
                  <>
                    <Field label="Quiz access">
                      <select
                        className={inputClass}
                        value={paid ? 'paid' : 'free'}
                        onChange={(e) => setPaid(e.target.value === 'paid')}
                      >
                        <option value="free">Free</option>
                        <option value="paid">Paid</option>
                      </select>
                    </Field>
                    {paid && (
                      <Field label="Price (USD)">
                        <input
                          className={inputClass}
                          type="number"
                          min="0.01"
                          max="10000000"
                          step="0.01"
                          value={price || ''}
                          onChange={(e) => setPrice(Number(e.target.value))}
                        />
                      </Field>
                    )}
                  </>
                )}
                <Field label="Passing score (%)">
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={100}
                    value={passing}
                    onChange={(e) => setPassing(Number(e.target.value))}
                  />
                </Field>
                <Field label="Time limit (minutes)">
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    max={180}
                    value={time}
                    onChange={(e) => setTime(Number(e.target.value))}
                  />
                </Field>
                {!courseId && purpose === 'assessment' && (
                  <div className="sm:col-span-2 border-t border-slate-100 pt-5 space-y-4">
                    <h4 className="text-sm font-semibold">Certificates</h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Certificate qualification">
                        <select
                          className={inputClass}
                          value={certificateRule}
                          onChange={(e) =>
                            setCertificateRule(e.target.value as typeof certificateRule)
                          }
                        >
                          <option value="none">No certificate</option>
                          <option value="submit">Complete quiz</option>
                          <option value="pass">Pass the quiz</option>
                        </select>
                      </Field>
                      {certificateRule !== 'none' && (
                        <Field label="Certificate delivery">
                          <select
                            className={inputClass}
                            value={certificateMode}
                            onChange={(e) =>
                              setCertificateMode(e.target.value as typeof certificateMode)
                            }
                          >
                            {Object.entries(CERTIFICATE_LABELS).map(([v, l]) => (
                              <option key={v} value={v}>
                                {l}
                              </option>
                            ))}
                          </select>
                        </Field>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">
                      {certificateRule === 'none'
                        ? 'This quiz does not issue certificates.'
                        : certificateRule === 'pass'
                          ? 'A passing score is required.'
                          : 'Answer every question and submit within the time limit; passing is not required.'}{' '}
                      {certificateRule !== 'none' && `${CERTIFICATE_MODES[certificateMode]}.`}
                    </p>
                  </div>
                )}
              </div>
            </Panel>
            <Panel className="xl:col-span-5 min-w-0 space-y-4">
              <Field label="Quiz thumbnail">
                <select
                  className={inputClass}
                  value={customThumbnail ? 'custom' : 'course'}
                  disabled={uploadingThumbnail}
                  onChange={(e) => setCustomThumbnail(e.target.value === 'custom')}
                >
                  <option value="course">{courseId ? 'Use course image' : 'No thumbnail'}</option>
                  <option value="custom">Custom image</option>
                </select>
              </Field>
              {customThumbnail ? (
                <div className="w-full">
                  <CourseThumbnail
                    courseId={courseId || quizId}
                    value={thumbnail}
                    onChange={setThumbnail}
                    onBusy={setUploadingThumbnail}
                    kind="quiz"
                  />
                </div>
              ) : (
                <div className="space-y-2">
                  <div
                    className={`relative w-full overflow-hidden rounded-xl bg-slate-100 ${selectedCourse?.thumbnail ? 'aspect-video' : 'h-24 border border-dashed border-slate-200'}`}
                  >
                    {selectedCourse?.thumbnail ? (
                      <Image
                        src={selectedCourse.thumbnail}
                        alt="Inherited course thumbnail"
                        fill
                        sizes="400px"
                        className="object-cover"
                      />
                    ) : (
                      <div className="flex h-full items-center justify-center text-sm text-slate-400">
                        {courseId ? 'No course thumbnail yet' : 'Standalone quiz'}
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-slate-500">
                    {courseId
                      ? 'Automatically follows this course’s thumbnail.'
                      : 'Choose a custom image if you want a thumbnail for this standalone quiz.'}
                  </p>
                </div>
              )}
            </Panel>
          </div>
          <QuizQuestionImport
            count={questions.length}
            disabled={saving}
            onImport={(imported) => setQuestions((current) => [...current, ...imported])}
          />
          {questions.map((q, i) => (
            <Panel key={q.id} className="space-y-4">
              <div className="flex justify-between">
                <h3 className="font-semibold">Question {i + 1}</h3>
                <button
                  type="button"
                  aria-label="Remove question"
                  onClick={() => setQuestions(questions.filter((x) => x.id !== q.id))}
                >
                  <Trash2 className="w-4 h-4 text-rose-500" />
                </button>
              </div>
              <Field label="Question">
                <input
                  required
                  className={inputClass}
                  value={q.text}
                  onChange={(e) => change(q.id, { text: e.target.value })}
                />
              </Field>
              <p className="text-xs text-slate-400">Select the circle beside the correct answer.</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {q.options.map((o) => (
                  <div className="flex gap-3 items-center" key={o.id}>
                    <input
                      aria-label={`Mark answer ${o.text || o.id} correct`}
                      type="radio"
                      name={`correct-${q.id}`}
                      checked={q.correctOptionId === o.id}
                      onChange={() => change(q.id, { correctOptionId: o.id })}
                    />
                    <input
                      aria-label="Answer text"
                      required
                      className={inputClass}
                      value={o.text}
                      onChange={(e) =>
                        change(q.id, {
                          options: q.options.map((x) =>
                            x.id === o.id ? { ...x, text: e.target.value } : x,
                          ),
                        })
                      }
                    />
                  </div>
                ))}
              </div>
              <Field label="Explanation">
                <textarea
                  className={inputClass}
                  value={q.explanation || ''}
                  onChange={(e) => change(q.id, { explanation: e.target.value })}
                />
              </Field>
            </Panel>
          ))}
          <div className="flex justify-between gap-3">
            <button
              className={secondaryClass}
              type="button"
              disabled={saving || questions.length >= 100}
              onClick={() =>
                setQuestions([
                  ...questions,
                  {
                    id: crypto.randomUUID(),
                    text: '',
                    options: Array.from({ length: 4 }, () => ({
                      id: crypto.randomUUID(),
                      text: '',
                    })),
                    correctOptionId: '',
                    explanation: '',
                  },
                ])
              }
            >
              <Plus className="w-4 h-4" />
              Add question
            </button>
            <div className="flex flex-wrap gap-3">
              {existing?.status !== 'published' && (
                <button
                  className={secondaryClass}
                  type="button"
                  disabled={saving || locked || uploadingThumbnail}
                  onClick={() => void save('draft')}
                >
                  Save draft
                </button>
              )}
              <button
                className={primaryClass}
                type="submit"
                disabled={saving || locked || uploadingThumbnail}
              >
                {saving
                  ? 'Saving…'
                  : existing?.status === 'published'
                    ? 'Save changes'
                    : 'Publish assessment'}
              </button>
            </div>
          </div>
        </fieldset>
      </form>
      {existing && existing.purpose !== 'practice' && existing.maxAttempts != null && (
        <QuizAttemptAccess quizId={existing.id} />
      )}
      {existing && !existing.courseId && existing.certificateMode === 'approval' && (
        <AwardApproval kind="quiz" subjectId={existing.id} />
      )}
    </FeatureShell>
  )
}
