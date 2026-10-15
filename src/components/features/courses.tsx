'use client'
import React, { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import { CourseBrowser } from './course-browser'
import { CourseArtwork } from '@/components/shared/CourseArtwork'
import { AwardApproval } from './award-approval'
import {
  COMPLETION_RULES,
  CERTIFICATE_MODES,
  COMPLETION_LABELS,
  CERTIFICATE_LABELS,
} from '@/lib/lms/award-rules'
import {
  ArrowRight,
  CheckCircle2,
  Play,
  Plus,
  Trash2,
  FileText,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ArrowLeft,
  Pencil,
  Search,
  X,
} from 'lucide-react'
import { useLms } from '@/lib/lms/store'
import { courseSchema } from '@/lib/lms/commands'
import { learnerCourseUrl } from '@/lib/lms/course-url'
import { LessonNotes } from './lesson-notes'
import { WorksheetEditor, LessonWorksheet } from './lesson-worksheet'
import { LessonResources } from './lesson-resources'
import { LessonContent } from './lesson-content'
const LessonRichEditor = dynamic(
  () => import('./lesson-rich-editor').then((m) => m.LessonRichEditor),
  {
    ssr: false,
    loading: () => (
      <div
        className="h-44 animate-pulse rounded-xl bg-slate-100"
        aria-label="Loading lesson editor"
      />
    ),
  },
)
import { CourseThumbnail } from './course-thumbnail'
import { Badge, ProgressBar } from '@/components/shared/ui'
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
import { formatCurrency } from '@/lib/utils'
import type { Course, CourseCategory, CourseLevel, Role, Module, Lesson } from '@/types'

export function SavedLessonPreview({ lesson, editHref }: { lesson: Lesson; editHref: string }) {
  const [expanded, setExpanded] = useState(false)
  return (
    <details
      className="group border-b border-slate-100 last:border-0"
      onToggle={(e) => setExpanded(e.currentTarget.open)}
    >
      <summary className="flex cursor-pointer items-center gap-3 px-4 py-3 text-sm text-slate-600 hover:bg-slate-50">
        <FileText className="h-4 w-4 shrink-0 text-slate-400" />
        <span className="flex-1 font-medium">{lesson.title || 'Untitled lesson'}</span>
        <span className="text-xs text-slate-400">{lesson.duration} min</span>
        <span className="text-xs font-semibold text-brand-600 group-open:hidden">Preview</span>
        <span className="hidden text-xs font-semibold text-brand-600 group-open:inline">Close</span>
      </summary>
      <div className="space-y-4 border-t border-slate-100 bg-slate-50/50 p-4 sm:p-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Saved {lesson.type} lesson
        </p>
        {lesson.type === 'video' &&
          (lesson.videoUrl ? (
            <video controls preload="metadata" className="w-full rounded-xl" src={lesson.videoUrl}>
              Your browser does not support video playback.
            </video>
          ) : (
            <p className="text-sm text-slate-500">No video URL has been saved yet.</p>
          ))}
        <div className="space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">Lesson text</h4>
            <span className="text-xs text-slate-400">Read-only preview</span>
          </div>
          <LessonContent
            content={lesson.content}
            empty="No lesson text has been saved yet. Select Edit lesson to add it."
          />
        </div>
        {lesson.type === 'quiz' && (
          <p className="text-sm text-slate-500">
            Manage this course’s assessment in the Quizzes section.
          </p>
        )}
        <Link href={editHref} className={secondaryClass}>
          Edit lesson <ArrowRight className="h-4 w-4" />
        </Link>
        <WorksheetEditor key={lesson.id} lesson={lesson} />
        {expanded && <LessonResources key={lesson.id} lessonId={lesson.id} editable />}
      </div>
    </details>
  )
}
export function CourseList({ role, catalog = false }: { role: Role; catalog?: boolean }) {
  return <CourseBrowser role={role} catalog={catalog} />
}
export function CourseDetail({ role, id: reference }: { role: Role; id: string }) {
  const { state, mutate, notice, user: currentUser } = useLms()
  const router = useRouter()
  const course = state.courses.find(
    (c) =>
      (c.id === reference || (role === 'learner' && c.slug === reference)) &&
      (role !== 'tutor' || c.tutorId === currentUser.id),
  )
  const id = course?.id || reference
  const enrollment = state.enrollments.find(
    (e) => e.courseId === id && e.learnerId === currentUser.id,
  )
  if (!course || (role === 'learner' && course.status !== 'published' && !enrollment))
    return (
      <FeatureShell role={role} title="Course not found">
        <Empty
          title="Course unavailable"
          description="This course may have been archived or moved."
          href={`/${role}/courses`}
          action="Back to courses"
        />
      </FeatureShell>
    )
  const lessons = course.modules.flatMap((m) => m.lessons)
  const courseQuizzes = state.quizzes.filter(
    (q) => q.courseId === id && q.status !== 'draft' && q.purpose !== 'practice',
  )
  const practiceQuizzes = state.quizzes.filter(
    (q) => q.courseId === id && q.status !== 'draft' && q.purpose === 'practice',
  )
  const completionRule =
    course.completionRule || (course.requireAssessment === false ? 'lessons' : 'lessons_pass')
  const needsQuiz = completionRule !== 'lessons'
  const needsLessons = !completionRule.startsWith('quiz_')
  const submissionOnly = completionRule.endsWith('submit')
  const earned = !!enrollment?.certificateIssued
  const finished = earned || !!enrollment?.completedAt
  const quizzesRemaining = submissionOnly
    ? courseQuizzes.length
    : Math.max(
        0,
        (enrollment?.totalAssessments ?? courseQuizzes.length) -
          (enrollment?.passedAssessments ?? courseQuizzes.filter((q) => q.passed).length),
      )
  const lessonsRemaining = needsLessons && (enrollment?.progress ?? 0) < 100
  const statusTitle = earned
    ? 'Certificate earned'
    : finished
      ? 'Course completed'
      : lessonsRemaining
        ? 'Continue learning'
        : needsQuiz && !courseQuizzes.length
          ? 'Waiting for the course quiz'
          : needsQuiz && quizzesRemaining > 0
            ? submissionOnly
              ? needsLessons
                ? 'Lessons complete — finish the quizzes'
                : 'Complete the course quizzes'
              : (needsLessons ? 'Lessons complete — ' : '') +
                (quizzesRemaining === 1
                  ? 'one quiz remaining'
                  : quizzesRemaining + ' quizzes remaining')
            : needsQuiz
              ? 'Quiz results recorded'
              : 'Lessons complete'
  const statusMessage = earned
    ? 'You’ve completed this course.'
    : finished
      ? course.certificateMode === 'approval' && enrollment?.certificateEnabled !== false
        ? 'Your certificate is awaiting approval.'
        : ''
      : lessonsRemaining
        ? needsQuiz
          ? 'Finish the lessons, then ' +
            (submissionOnly ? 'complete' : 'pass') +
            ' the course quizzes.'
          : 'Pick up where you left off.'
        : needsQuiz && !courseQuizzes.length
          ? 'Your instructor will make it available here.'
          : needsQuiz && quizzesRemaining > 0
            ? (submissionOnly ? 'Complete' : 'Pass') +
              (quizzesRemaining === 1 ? ' the remaining quiz' : ' the remaining quizzes') +
              ' to finish this course.'
            : 'Your completion is being updated.'
  async function enroll() {
    if (!(await mutate({ type: 'enroll', courseId: id }))) return
    notice('You’re enrolled. Your next chapter starts now!')
    router.push(learnerCourseUrl(course!, '/learn'))
  }
  return (
    <FeatureShell role={role} title="Course overview">
      <Back href={role === 'learner' && !enrollment ? '/learner/catalog' : `/${role}/courses`} />
      <div className="grid lg:grid-cols-3 gap-7">
        <div className="lg:col-span-2">
          <div className="rounded-2xl bg-navy text-white p-7 sm:p-10 mb-6">
            <div className="flex gap-2 mb-5">
              <Badge variant="info">{course.category}</Badge>
              <Badge>{course.level}</Badge>
            </div>
            <h2 className="text-3xl font-bold tracking-tight leading-tight mb-4">{course.title}</h2>
            <p className="text-slate-300 text-sm leading-7">{course.description}</p>
            <div className="flex items-center gap-3 mt-7">
              <span
                aria-hidden="true"
                className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-xs font-semibold"
              >
                {course.tutorName
                  .replace('Dr. ', '')
                  .split(' ')
                  .map((n) => n[0])
                  .slice(0, 2)
                  .join('')}
              </span>
              <div>
                <p className="text-xs text-slate-400">Your instructor</p>
                <p className="text-sm font-semibold">{course.tutorName}</p>
              </div>
            </div>
          </div>
          <Panel>
            <h3 className="font-semibold text-lg mb-2">Course curriculum</h3>
            <p className="text-sm text-slate-500 mb-6">
              {course.modules.length} {course.modules.length === 1 ? 'module' : 'modules'} ·{' '}
              {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'} ·{' '}
              {role === 'learner'
                ? 'Learn at your own pace'
                : 'Select a lesson to preview its saved content'}
            </p>
            <div className="space-y-3">
              {course.modules.map((m, i) => (
                <details open={i === 0} key={m.id} className="border border-slate-200 rounded-xl">
                  <summary className="cursor-pointer p-4 font-semibold text-sm">
                    {String(i + 1).padStart(2, '0')} · {m.title}
                    <span className="float-right mr-3 text-xs font-normal text-slate-400">
                      {m.lessons.length} {m.lessons.length === 1 ? 'lesson' : 'lessons'}
                    </span>
                  </summary>
                  <div className="border-t border-slate-100">
                    {m.lessons.map((l) =>
                      role !== 'learner' ? (
                        <SavedLessonPreview
                          key={l.id}
                          lesson={l}
                          editHref={`/${role}/courses/${id}/edit#lesson-${l.id}`}
                        />
                      ) : (
                        <div
                          key={l.id}
                          className="flex gap-3 items-center px-4 py-3 text-sm text-slate-600"
                        >
                          <FileText className="w-4 h-4 text-slate-400" />
                          <span className="flex-1">{l.title}</span>
                          <span className="text-xs text-slate-400">{l.duration} min</span>
                        </div>
                      ),
                    )}
                  </div>
                </details>
              ))}
            </div>
          </Panel>
          {role === 'learner' && enrollment && practiceQuizzes.length > 0 && (
            <Panel className="mt-6">
              <h3 className="font-semibold mb-4">Practice quizzes</h3>
              <div className="space-y-2">
                {practiceQuizzes.map((q) => (
                  <Link
                    key={q.id}
                    href={`/learner/quizzes/${q.id}`}
                    className={`${secondaryClass} w-full justify-between`}
                  >
                    <span>{q.title}</span>
                    <span className="text-xs">Practice</span>
                  </Link>
                ))}
              </div>
            </Panel>
          )}
          {role !== 'learner' && course.certificateMode === 'approval' && (
            <AwardApproval kind="course" subjectId={id} />
          )}
          {role === 'learner' && enrollment && (
            <Panel className="mt-6">
              <div id="course-assessments" className="scroll-mt-24">
                <div className="flex items-start gap-3">
                  {(earned || finished) && (
                    <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
                  )}
                  <div>
                    <h3 className="text-lg font-semibold">{statusTitle}</h3>
                    {statusMessage && (
                      <p className="mt-1 text-sm text-slate-600">{statusMessage}</p>
                    )}
                  </div>
                </div>
                {!!courseQuizzes.length &&
                  (finished || !needsQuiz ? (
                    <details className="mt-4 border-t border-slate-100 pt-3">
                      <summary className="cursor-pointer text-sm font-medium text-slate-600">
                        {finished ? 'Course assessments' : 'Optional assessments'}
                      </summary>
                      <div className="mt-3 space-y-2">
                        {courseQuizzes.map((q) => (
                          <Link
                            key={q.id}
                            href={`/learner/quizzes/${q.id}`}
                            className={`${secondaryClass} w-full justify-between`}
                          >
                            <span className="min-w-0 truncate">{q.title}</span>
                            <span className="shrink-0 text-xs">
                              {q.passed || q.bestScore != null
                                ? 'Review quiz'
                                : q.inProgress
                                  ? 'Resume quiz'
                                  : 'Take quiz'}
                            </span>
                          </Link>
                        ))}
                      </div>
                    </details>
                  ) : (
                    <div className="mt-4 space-y-2">
                      {courseQuizzes.map((q) => (
                        <Link
                          key={q.id}
                          href={`/learner/quizzes/${q.id}`}
                          className={`${secondaryClass} w-full justify-between gap-3`}
                        >
                          <span className="min-w-0 truncate">{q.title}</span>
                          <span className="shrink-0 text-xs">
                            {q.passed
                              ? 'Passed'
                              : submissionOnly && q.bestScore != null
                                ? 'Review quiz'
                                : q.inProgress
                                  ? 'Resume quiz'
                                  : 'Take quiz'}
                          </span>
                        </Link>
                      ))}
                    </div>
                  ))}
                {enrollment.certificateIssued && (
                  <Link
                    className={`${primaryClass} mt-4`}
                    href={`/learner/certificates/course/${course.id}`}
                  >
                    View certificate
                  </Link>
                )}
                {!enrollment.certificateIssued &&
                  enrollment.completedAt &&
                  enrollment.certificateEnabled !== false &&
                  course.certificateMode !== 'none' &&
                  course.certificateMode !== 'approval' && (
                    <button
                      className={`${primaryClass} mt-4`}
                      onClick={async () => {
                        if (
                          await mutate({
                            type: 'award',
                            action: 'claim',
                            kind: 'course',
                            subjectId: id,
                          })
                        )
                          notice('Your certificate is ready.')
                      }}
                    >
                      Get certificate
                    </button>
                  )}
              </div>
            </Panel>
          )}
        </div>
        <div>
          <Panel>
            <div className="relative aspect-video overflow-hidden rounded-xl bg-brand-50 flex items-center justify-center mb-5">
              {course.thumbnail ? (
                <Image
                  src={course.thumbnail}
                  alt={course.title}
                  fill
                  sizes="(max-width: 1024px) 100vw, 400px"
                  className="object-cover"
                />
              ) : (
                <CourseArtwork category={course.category} title={course.title} />
              )}
            </div>
            <p className="text-3xl font-bold mb-1">
              {course.price ? formatCurrency(course.price) : 'Free'}
            </p>
            <p className="text-xs text-slate-400 mb-5">
              {course.price > 0 ? 'One-time purchase required for access.' : 'Free access.'}
            </p>
            {role === 'learner' ? (
              enrollment ? (
                <>
                  <ProgressBar value={enrollment.progress} />
                  <p className="my-3 text-xs text-slate-500">
                    {enrollment.progress}% of lessons complete
                  </p>
                  <Link
                    className={`${primaryClass} w-full`}
                    href={
                      !finished && !lessonsRemaining
                        ? `#course-assessments`
                        : learnerCourseUrl(course, '/learn')
                    }
                  >
                    <Play className="w-4 h-4" />
                    {finished
                      ? 'Review course'
                      : !lessonsRemaining
                        ? needsQuiz
                          ? 'View quizzes'
                          : 'View completion'
                        : 'Continue learning'}
                  </Link>
                </>
              ) : course.price > 0 ? (
                <button className={`${primaryClass} w-full`} disabled>
                  Payments coming soon
                </button>
              ) : (
                <button className={`${primaryClass} w-full`} onClick={enroll}>
                  Enroll in course <ArrowRight className="w-4 h-4" />
                </button>
              )
            ) : (
              <>
                <Link
                  className={`${primaryClass} w-full mb-3`}
                  href={`/${role}/courses/${id}/edit`}
                >
                  Edit course
                </Link>
                <button
                  className={`${secondaryClass} w-full`}
                  onClick={async () => {
                    const next = course.status === 'published' ? 'archived' : 'published'
                    if (
                      !(await mutate({ type: 'saveCourse', course: { ...course, status: next } }))
                    )
                      return
                    notice(`Course ${next}.`)
                  }}
                >
                  {course.status === 'published' ? 'Archive course' : 'Publish course'}
                </button>
              </>
            )}
            <div className="space-y-4 mt-6 text-sm text-slate-500">
              <p className="flex gap-3">
                {course.duration} {course.duration === 1 ? 'hour' : 'hours'} of learning
              </p>
              <p className="flex gap-3">
                {lessons.length} {lessons.length === 1 ? 'lesson' : 'lessons'}
              </p>
              <p className="flex gap-3">
                {role === 'learner'
                  ? earned
                    ? 'Certificate earned'
                    : course.certificateMode === 'none' || enrollment?.certificateEnabled === false
                      ? 'Course completion'
                      : 'Certificate available'
                  : COMPLETION_RULES[completionRule]}
              </p>
            </div>
            {role !== 'learner' && (
              <p className="mt-5">
                <Badge>{course.status}</Badge>
              </p>
            )}
          </Panel>
        </div>
      </div>
    </FeatureShell>
  )
}
export function CoursePlayer({ id: reference }: { id: string }) {
  const { state, mutate, notice, user: currentUser } = useLms()
  const [selected, setSelected] = useState('')
  const [tab, setTab] = useState('Overview')
  const [completing, setCompleting] = useState(false)
  const completionPending = useRef(false)
  const course = state.courses.find((c) => c.id === reference || c.slug === reference)
  const id = course?.id || reference
  const enrollment = state.enrollments.find(
    (e) => e.courseId === id && e.learnerId === currentUser.id,
  )
  const key = `${currentUser.id}:${id}`
  const completed = state.completedLessons[key] || []
  const lessons = course?.modules.flatMap((m) => m.lessons) || []
  const lesson =
    lessons.find((l) => l.id === selected) ||
    lessons.find((l) => !completed.includes(l.id)) ||
    lessons[0]
  const quizzes = state.quizzes.filter((q) => q.courseId === id && q.status !== 'draft')
  const lessonHeading = useRef<HTMLDivElement>(null)
  const previousLesson = useRef<string | undefined>(undefined)
  useEffect(() => {
    const lessonId = lesson?.id
    if (!lessonId) return
    if (previousLesson.current && previousLesson.current !== lessonId) {
      setTab('Overview')
      const heading = lessonHeading.current
      heading?.focus({ preventScroll: true })
      heading?.scrollIntoView({
        block: 'start',
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 'instant'
          : 'smooth',
      })
    }
    previousLesson.current = lessonId
  }, [lesson?.id])
  if (!course || !enrollment || !lesson)
    return (
      <FeatureShell role="learner" title="Learning workspace">
        <Empty
          title="Enroll to start learning"
          description="Choose a course and join before opening its lessons."
          href={learnerCourseUrl(course || { id })}
          action="View course"
        />
      </FeatureShell>
    )
  async function complete() {
    if (!course || !enrollment || !lesson) return
    if (completionPending.current) return
    completionPending.current = true
    setCompleting(true)
    try {
      const next = lessons[lessons.indexOf(lesson) + 1]
      if (completed.includes(lesson.id)) {
        if (next) setSelected(next.id)
        return
      }
      const ids = Array.from(new Set([...completed, lesson.id]))
      const progress = Math.round((ids.length / lessons.length) * 100)
      if (!(await mutate({ type: 'complete', lessonId: lesson.id }))) return
      if (next) setSelected(next.id)
      notice(
        progress === 100
          ? 'All lessons completed. View course progress for your requirements and certificate status.'
          : 'Lesson completed. Progress saved.',
      )
    } finally {
      completionPending.current = false
      setCompleting(false)
    }
  }
  return (
    <FeatureShell role="learner" title="Learning workspace">
      <Back href={learnerCourseUrl(course)} label="Back to overview" />
      <Heading title={course.title} />
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-5">
          <div
            ref={lessonHeading}
            tabIndex={-1}
            aria-labelledby="current-lesson-title"
            className="scroll-mt-24 rounded-2xl bg-navy p-8 sm:p-12 text-white min-h-56 flex flex-col justify-center focus:outline-none"
          >
            <span className="text-brand-300 text-xs uppercase tracking-widest mb-3">
              Lesson {lessons.indexOf(lesson) + 1} of {lessons.length} · {lesson.duration} min
            </span>
            <h3 id="current-lesson-title" className="text-2xl font-semibold">
              {lesson.title}
            </h3>
            <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">
              Lesson {lessons.indexOf(lesson) + 1} of {lessons.length}: {lesson.title}
            </p>
          </div>
          <Panel>
            <div className="flex gap-6 border-b border-slate-100 mb-6">
              {['Overview', 'My notes', 'Resources'].map((t) => (
                <button
                  className={`pb-3 text-sm font-semibold border-b-2 ${tab === t ? 'border-brand-600 text-brand-600' : 'border-transparent text-slate-400'}`}
                  onClick={() => setTab(t)}
                  key={t}
                >
                  {t}
                </button>
              ))}
            </div>
            {tab === 'Overview' ? (
              <div className="text-sm leading-7 text-slate-600">
                {lesson.type === 'video' && lesson.videoUrl && (
                  <video
                    key={lesson.id}
                    controls
                    className="w-full rounded-xl mb-5"
                    src={lesson.videoUrl}
                  >
                    Your browser does not support this video.
                  </video>
                )}
                <LessonContent
                  content={lesson.content}
                  empty="Your tutor has not added the lesson guide yet."
                />
                {lesson.type === 'quiz' && (
                  <p className="mt-5">
                    Course assessments are listed in your course path.{' '}
                    {course.requireAssessment === false
                      ? 'Use them for optional practice.'
                      : course.completionRule?.endsWith('submit')
                        ? 'Submit every published assessment; passing is not required.'
                        : 'Each published assessment must be passed.'}
                  </p>
                )}
              </div>
            ) : tab === 'My notes' ? (
              <>
                <p className="text-sm text-slate-500 mb-3">
                  Your private notes are saved to your account.
                </p>
                <LessonNotes
                  key={lesson.id}
                  lessonId={lesson.id}
                  initial={state.notes[`${key}:${lesson.id}`] || ''}
                />
              </>
            ) : (
              <>
                <LessonWorksheet key={lesson.id} lesson={lesson} courseTitle={course.title} />
                <div className="mt-6">
                  <LessonResources key={lesson.id} lessonId={lesson.id} />
                </div>
              </>
            )}
          </Panel>
          <div className="flex flex-wrap justify-between gap-3">
            <button
              className={secondaryClass}
              disabled={lessons.indexOf(lesson) === 0}
              onClick={() => setSelected(lessons[lessons.indexOf(lesson) - 1].id)}
            >
              Previous lesson
            </button>
            {completed.includes(lesson.id) && lessons.indexOf(lesson) === lessons.length - 1 ? (
              <Link
                className={primaryClass}
                href={
                  enrollment.certificateIssued
                    ? `/learner/certificates/course/${course.id}`
                    : learnerCourseUrl(course, '#course-assessments')
                }
              >
                {enrollment.certificateIssued ? 'View certificate' : 'View course progress'}{' '}
                <ArrowRight className="w-4 h-4" />
              </Link>
            ) : (
              <button className={primaryClass} onClick={complete} disabled={completing}>
                {completing
                  ? 'Saving progress…'
                  : completed.includes(lesson.id)
                    ? 'Continue to next lesson'
                    : lessons.indexOf(lesson) === lessons.length - 1
                      ? 'Complete final lesson'
                      : 'Mark complete & continue'}
                <CheckCircle2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>
        <Panel className="h-fit">
          <h3 className="font-semibold mb-3">Your course path</h3>
          <ProgressBar value={enrollment.progress} />
          <p className="text-xs text-slate-400 mt-2 mb-5">
            {completed.length} of {lessons.length} lessons complete
          </p>
          {course.modules.map((m) => (
            <div key={m.id} className="mb-5">
              <h4 className="text-xs uppercase tracking-wider text-slate-400 font-semibold mb-2">
                {m.title}
              </h4>
              {m.lessons.map((l) => (
                <button
                  key={l.id}
                  onClick={() => setSelected(l.id)}
                  className={`w-full text-left flex items-center gap-3 text-sm px-3 py-3 rounded-xl ${lesson.id === l.id ? 'bg-brand-50 text-brand-700' : 'text-slate-600 hover:bg-slate-50'}`}
                >
                  <CheckCircle2
                    className={`w-4 h-4 shrink-0 ${completed.includes(l.id) ? 'text-emerald-500' : 'text-slate-300'}`}
                  />
                  {l.title}
                </button>
              ))}
            </div>
          ))}
          <div className="border-t border-slate-100 pt-4 space-y-3">
            <h4 className="text-sm font-semibold">Course quizzes</h4>
            {quizzes.length ? (
              quizzes.map((q) => (
                <Link
                  key={q.id}
                  className={`${secondaryClass} w-full justify-between`}
                  href={`/learner/quizzes/${q.id}`}
                >
                  <span>{q.title}</span>
                  <span>
                    {q.purpose === 'practice'
                      ? 'Practice'
                      : q.passed
                        ? 'Passed'
                        : q.inProgress
                          ? 'Resume'
                          : 'Open'}
                  </span>
                </Link>
              ))
            ) : (
              <p className="text-xs text-slate-500">
                {course.requireAssessment === false
                  ? 'No practice assessments yet. Complete all lessons to finish this course.'
                  : 'Your tutor has not published an assessment yet.'}
              </p>
            )}
          </div>
          {enrollment.certificateIssued && (
            <Link
              className="block text-center text-sm text-brand-600 mt-4"
              href={`/learner/certificates/course/${course.id}`}
            >
              View your certificate
            </Link>
          )}
        </Panel>
      </div>
    </FeatureShell>
  )
}

export function CourseEditor({ role, id }: { role: Role; id?: string }) {
  const { state, execute, notice, user: currentUser, ready: optionsReady = true } = useLms()
  const router = useRouter()
  const existing = state.courses.find(
    (c) => c.id === id && (role !== 'tutor' || c.tutorId === currentUser.id),
  )
  const [saving, setSaving] = useState(false)
  const [courseId] = useState(id || crypto.randomUUID())
  const [thumbnail, setThumbnail] = useState(existing?.thumbnail || '')
  const [uploading, setUploading] = useState(false)
  const [saveError, setSaveError] = useState('')
  const [savedRevision, setSavedRevision] = useState(existing?.updatedAt)
  const [resourceUploads, setResourceUploads] = useState(0)
  const [savedLessons, setSavedLessons] = useState(
    existing?.modules.flatMap((m) => m.lessons.map((l) => l.id)) || [],
  )
  const [title, setTitle] = useState(existing?.title || '')
  const [description, setDescription] = useState(existing?.description || '')
  const [category, setCategory] = useState<CourseCategory>(
    existing?.category || state.categories[0] || '',
  )
  const [level, setLevel] = useState<CourseLevel>(existing?.level || 'Beginner')
  const [price, setPrice] = useState(existing?.price || 0)
  const [duration, setDuration] = useState(existing?.duration ?? 1)
  const [requireAssessment, setRequireAssessment] = useState(existing?.requireAssessment ?? true)
  const [completionRule, setCompletionRule] = useState<Course['completionRule']>(
    existing?.completionRule ||
      (existing?.requireAssessment === false ? 'lessons' : 'lessons_pass'),
  )
  const [certificateMode, setCertificateMode] = useState<Course['certificateMode']>(
    existing?.certificateMode || 'automatic',
  )
  const [modules, setModules] = useState<Module[]>(existing?.modules || [])
  const [editorTab, setEditorTab] = useState(id ? 'curriculum' : 'details')
  const [selectedModuleId, setSelectedModuleId] = useState(existing?.modules[0]?.id || '')
  const [selectedLessonId, setSelectedLessonId] = useState(
    existing?.modules[0]?.lessons[0]?.id || '',
  )
  const [expandedModules, setExpandedModules] = useState<string[]>(
    existing?.modules[0] ? [existing.modules[0].id] : [],
  )
  const [curriculumSearch, setCurriculumSearch] = useState('')
  const [selectionTick, setSelectionTick] = useState(0)
  const [moduleEditorId, setModuleEditorId] = useState('')
  const focusTarget = useRef<'heading' | 'module' | 'lesson'>('heading')
  const moduleTitleRef = useRef<HTMLInputElement>(null)
  const lessonTitleRef = useRef<HTMLInputElement>(null)
  const [lessonEditorOpen, setLessonEditorOpen] = useState(false)
  const [lessonEditorExpanded, setLessonEditorExpanded] = useState(false)
  const [pendingModuleRemoval, setPendingModuleRemoval] = useState<Module | null>(null)
  const [lessonRemovalOpen, setLessonRemovalOpen] = useState(false)
  const removalDialogRef = useRef<HTMLDialogElement>(null)
  const lessonDialogRef = useRef<HTMLDialogElement>(null)
  const lessonBodyRef = useRef<HTMLDivElement>(null)
  const [readinessIssues, setReadinessIssues] = useState<
    { message: string; section: string; moduleIndex?: number; lessonIndex?: number }[] | null
  >(null)
  const readinessDialogRef = useRef<HTMLDialogElement>(null)
  const [dirty, setDirty] = useState(false)
  const [leaveHref, setLeaveHref] = useState('')
  const leaveDialogRef = useRef<HTMLDialogElement>(null)
  const editVersion = useRef(0)
  const lessonHeadingRef = useRef<HTMLHeadingElement>(null)
  const focusLesson = useRef(false)
  const editorFormRef = useRef<HTMLFormElement>(null)
  const actionBarRef = useRef<HTMLDivElement>(null)
  const curriculumRef = useRef(modules)
  curriculumRef.current = modules
  const locked = !!existing?.enrolledCount
  const navigationBusy = saving || uploading || resourceUploads > 0
  const selectedModule = modules.find((m) => m.id === selectedModuleId) || modules[0]
  const selectedLesson =
    selectedModule?.lessons.find((l) => l.id === selectedLessonId) || selectedModule?.lessons[0]
  const lessonPath = modules.flatMap((m) => m.lessons.map((l) => ({ module: m, lesson: l })))
  const lessonIndex = lessonPath.findIndex((p) => p.lesson.id === selectedLesson?.id)
  function markDirty() {
    editVersion.current++
    setDirty(true)
  }
  function changeModules(next: Module[]) {
    markDirty()
    setModules(next)
  }
  function chooseLesson(module: Module, lesson?: Lesson) {
    if (navigationBusy) return
    setLessonEditorExpanded(false)
    focusTarget.current = 'heading'
    setSelectionTick((previous) => previous + 1)
    const target = lesson || module.lessons[0]
    setSelectedModuleId(module.id)
    setSelectedLessonId(target?.id || '')
    if (id && typeof window !== 'undefined')
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search + (target ? `#lesson-${target.id}` : ''),
      )
    setExpandedModules((previous) =>
      previous.includes(module.id) ? previous : [...previous, module.id],
    )
    setLessonEditorOpen(!!target)
    setLessonRemovalOpen(false)
    focusLesson.current = true
  }
  function addModule() {
    if (!id && !title.trim()) {
      setEditorTab('details')
      return
    }
    setCurriculumSearch('')
    const newModule: Module = { id: crypto.randomUUID(), title: '', lessons: [] }
    changeModules([...modules, newModule])
    chooseLesson(newModule)
    setModuleEditorId(newModule.id)
    focusTarget.current = 'module'
    setEditorTab('curriculum')
  }
  function addLesson(module: Module) {
    if (!module.title.trim()) {
      setModuleEditorId(module.id)
      return
    }
    setCurriculumSearch('')
    const lesson: Lesson = { id: crypto.randomUUID(), title: '', type: 'reading', duration: 10 }
    changeModules(
      modules.map((m) => (m.id === module.id ? { ...m, lessons: [...m.lessons, lesson] } : m)),
    )
    chooseLesson(module, lesson)
    setModuleEditorId('')
    focusTarget.current = 'lesson'
  }
  function changeLesson(patch: Partial<Lesson>) {
    if (!selectedModule || !selectedLesson) return
    changeModules(
      modules.map((m) =>
        m.id === selectedModule.id
          ? {
              ...m,
              lessons: m.lessons.map((l) => (l.id === selectedLesson.id ? { ...l, ...patch } : l)),
            }
          : m,
      ),
    )
  }
  function requestModuleRemoval(target: Module) {
    if (locked || navigationBusy) return
    setPendingModuleRemoval(target)
  }
  function removeModule(target = selectedModule) {
    if (!target || locked || navigationBusy) return
    setCurriculumSearch('')
    const index = modules.indexOf(target),
      remaining = modules.filter((m) => m.id !== target.id)
    changeModules(remaining)
    const next = remaining[Math.min(index, remaining.length - 1)]
    if (next) {
      setSelectedModuleId(next.id)
      setSelectedLessonId(next.lessons[0]?.id || '')
    }
    setModuleEditorId('')
    setPendingModuleRemoval(null)
    closeLessonEditor()
  }
  function removeLesson() {
    if (!selectedModule || !selectedLesson || locked || navigationBusy) return
    setCurriculumSearch('')
    const index = selectedModule.lessons.indexOf(selectedLesson),
      remaining = selectedModule.lessons.filter((l) => l.id !== selectedLesson.id)
    changeModules(
      modules.map((m) => (m.id === selectedModule.id ? { ...m, lessons: remaining } : m)),
    )
    chooseLesson(
      { ...selectedModule, lessons: remaining },
      remaining[Math.min(index, remaining.length - 1)],
    )
    setLessonRemovalOpen(false)
    if (!remaining.length) closeLessonEditor()
  }
  useEffect(() => {
    const selectFromHash = () => {
      const lessonId = window.location.hash.match(/^#lesson-([0-9a-f-]{36})$/i)?.[1]
      if (!lessonId) return
      const matchingModule = curriculumRef.current.find((m) =>
        m.lessons.some((l) => l.id === lessonId),
      )
      if (!matchingModule) return
      setSelectedModuleId(matchingModule.id)
      setSelectedLessonId(lessonId)
      setExpandedModules((previous) =>
        previous.includes(matchingModule.id) ? previous : [...previous, matchingModule.id],
      )
      setEditorTab('curriculum')
      setLessonEditorOpen(true)
      setLessonEditorExpanded(false)
      focusLesson.current = true
    }
    selectFromHash()
    window.addEventListener('hashchange', selectFromHash)
    return () => window.removeEventListener('hashchange', selectFromHash)
  }, [id])
  function closeLessonEditor() {
    if (navigationBusy) return
    setLessonEditorExpanded(false)
    setLessonEditorOpen(false)
    setLessonRemovalOpen(false)
    if (id && typeof window !== 'undefined')
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search,
      )
  }
  useEffect(() => {
    if (!lessonEditorOpen) return
    const dialog = lessonDialogRef.current
    dialog?.showModal?.()
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = previousOverflow
      if (dialog?.open) dialog.close?.()
    }
  }, [lessonEditorOpen])
  useEffect(() => {
    if (!pendingModuleRemoval) return
    const dialog = removalDialogRef.current
    dialog?.showModal?.()
    return () => {
      if (dialog?.open) dialog.close?.()
    }
  }, [pendingModuleRemoval])
  useEffect(() => {
    if (focusLesson.current && editorTab === 'curriculum') {
      focusLesson.current = false
      const target =
        focusTarget.current === 'module'
          ? moduleTitleRef.current
          : focusTarget.current === 'lesson'
            ? lessonTitleRef.current
            : lessonHeadingRef.current
      target?.focus({ preventScroll: true })
      if (lessonEditorOpen) {
        if (lessonBodyRef.current) lessonBodyRef.current.scrollTop = 0
      } else target?.scrollIntoView?.({ block: 'center', behavior: 'smooth' })
    }
  }, [selectedModule?.id, selectedLesson?.id, editorTab, selectionTick, lessonEditorOpen])
  useEffect(() => {
    if (readinessIssues === null) return
    const dialog = readinessDialogRef.current
    dialog?.showModal?.()
    return () => {
      if (dialog?.open) dialog.close?.()
    }
  }, [readinessIssues])
  useEffect(() => {
    if (!dirty) return
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault()
      event.returnValue = ''
    }
    window.addEventListener('beforeunload', warn)
    const warnNavigation = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey ||
        event.altKey
      )
        return
      const anchor = (event.target as Element)?.closest?.('a')
      if (!anchor || anchor.target === '_blank' || anchor.hasAttribute('download')) return
      const destination = new URL(anchor.href, window.location.origin)
      if (
        destination.origin !== window.location.origin ||
        destination.pathname + destination.search ===
          window.location.pathname + window.location.search
      )
        return
      event.preventDefault()
      event.stopPropagation()
      setLeaveHref(destination.pathname + destination.search + destination.hash)
    }
    document.addEventListener('click', warnNavigation, true)
    return () => {
      window.removeEventListener('beforeunload', warn)
      document.removeEventListener('click', warnNavigation, true)
    }
  }, [dirty])
  useEffect(() => {
    if (!leaveHref) return
    const dialog = leaveDialogRef.current
    dialog?.showModal?.()
    return () => {
      if (dialog?.open) dialog.close?.()
    }
  }, [leaveHref])
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined' || !actionBarRef.current) return
    const resize = () =>
      editorFormRef.current?.style.setProperty(
        '--course-toolbar-height',
        `${Math.ceil(actionBarRef.current?.getBoundingClientRect().height || 96)}px`,
      )
    const observer = new ResizeObserver(resize)
    observer.observe(actionBarRef.current)
    resize()
    return () => observer.disconnect()
  }, [])
  const [tutorId, setTutorId] = useState(
    existing?.tutorId ||
      (role === 'tutor'
        ? currentUser.id
        : state.users.find((u) => u.role === 'tutor' && u.isActive)?.id || ''),
  )
  const categoryTouched = useRef(false)
  const tutorTouched = useRef(false)
  useEffect(() => {
    if (!id && !category && !categoryTouched.current && state.categories.length)
      setCategory(state.categories[0])
    if (!id && role === 'admin' && !tutorId && !tutorTouched.current) {
      const tutor = state.users.find((u) => u.role === 'tutor' && u.isActive)
      if (tutor) setTutorId(tutor.id)
    }
  }, [id, category, tutorId, role, state.categories, state.users])
  if (id && !existing)
    return (
      <FeatureShell role={role} title="Course editor">
        <Empty title="Course unavailable" href={`/${role}/courses`} />
      </FeatureShell>
    )
  function buildCourse(status: Course['status']): Course {
    const tutor =
      role === 'tutor'
        ? currentUser
        : state.users.find((u) => u.id === tutorId && u.role === 'tutor' && u.isActive)
    return {
      ...existing,
      id: courseId,
      title: title.trim(),
      description: description.trim(),
      category,
      level,
      price,
      duration,
      requireAssessment,
      completionRule,
      certificateMode,
      modules,
      status,
      tutorId,
      tutorName: tutor?.name || '',
      tutorAvatar: tutor?.avatar || '',
      thumbnail,
      enrolledCount: existing?.enrolledCount || 0,
      rating: existing?.rating || 0,
      reviewCount: existing?.reviewCount || 0,
      tags: existing?.tags || [category],
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: savedRevision || existing?.updatedAt || new Date().toISOString(),
    }
  }
  function reviewCourse() {
    const result = courseSchema.safeParse(buildCourse('published'))
    const issues = result.success
      ? []
      : result.error.issues.map((issue) => ({
          message:
            issue.path[0] === 'title' && !title.trim()
              ? 'Add a course title before publishing.'
              : issue.path[0] === 'category' && !category
                ? 'Choose a course category.'
                : issue.message,
          section:
            issue.path[0] === 'modules'
              ? 'curriculum'
              : ['title', 'description', 'category', 'level', 'thumbnail'].includes(
                    String(issue.path[0]),
                  )
                ? 'details'
                : 'settings',
          moduleIndex:
            issue.path[0] === 'modules' && typeof issue.path[1] === 'number'
              ? issue.path[1]
              : undefined,
          lessonIndex:
            issue.path[2] === 'lessons' && typeof issue.path[3] === 'number'
              ? issue.path[3]
              : undefined,
        }))
    if (
      role === 'admin' &&
      !state.users.some((u) => u.id === tutorId && u.role === 'tutor' && u.isActive)
    )
      issues.push({
        message: 'Choose an active tutor.',
        section: 'settings',
        moduleIndex: undefined,
        lessonIndex: undefined,
      })
    setReadinessIssues(issues)
  }
  async function save(event: React.FormEvent, status: Course['status'], stay = false) {
    event.preventDefault()
    if (saving || uploading || (!stay && resourceUploads > 0)) {
      if (stay) throw new Error('Wait for the current save or upload to finish.')
      return
    }
    setSaveError('')
    const tutor =
      role === 'tutor'
        ? currentUser
        : state.users.find((u) => u.id === tutorId && u.role === 'tutor' && u.isActive)
    if (!tutor) {
      setSaveError('Choose an active tutor before saving.')
      if (!stay) setEditorTab('settings')
      if (stay) throw new Error('Choose an active tutor before uploading a PDF.')
      return
    }
    const course = buildCourse(status)
    const validation = courseSchema.safeParse(course)
    if (!validation.success) {
      const issue = validation.error.issues[0]
      if (!stay) {
        if (issue.path[0] === 'modules') {
          setEditorTab('curriculum')
          const invalidModule = modules[Number(issue.path[1])]
          if (invalidModule)
            chooseLesson(invalidModule, invalidModule.lessons[Number(issue.path[3])])
        } else
          setEditorTab(
            ['title', 'description', 'category', 'level', 'thumbnail'].includes(
              String(issue.path[0]),
            )
              ? 'details'
              : 'settings',
          )
      }
      setSaveError(`${issue.path.join(' → ')}: ${issue.message}`)
      if (stay) throw new Error(`${issue.path.join(' → ')}: ${issue.message}`)
      return
    }
    setSaving(true)
    const savingVersion = editVersion.current
    try {
      const reply = (await execute({ type: 'saveCourse', course })) as { updatedAt?: string } | null
      if (reply?.updatedAt) setSavedRevision(reply.updatedAt)
      if (editVersion.current === savingVersion) setDirty(false)
      setSavedLessons(modules.flatMap((m) => m.lessons.map((l) => l.id)))
      notice(
        status === 'draft' ? 'Draft saved. You can continue editing it anytime.' : 'Course saved.',
      )
      if (!stay && (!id || (status === 'published' && existing?.status !== 'published')))
        router.push(`/${role}/courses/${courseId}`)
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : 'Unable to save your course. Please try again.',
      )
      if (stay) throw error
    } finally {
      setSaving(false)
    }
  }
  return (
    <FeatureShell role={role} title={id ? 'Edit course' : 'Create course'}>
      <dialog
        ref={readinessDialogRef}
        aria-labelledby="course-readiness-title"
        className="w-[min(92vw,520px)] max-h-[85dvh] overflow-y-auto rounded-2xl border-0 p-6 shadow-xl backdrop:bg-navy/30"
        onCancel={() => setReadinessIssues(null)}
        onClose={() => setReadinessIssues(null)}
      >
        <div className="flex items-center justify-between gap-4">
          <h3 id="course-readiness-title" className="text-lg font-semibold">
            Publication check
          </h3>
          <button
            type="button"
            aria-label="Close publication check"
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-50"
            onClick={() => setReadinessIssues(null)}
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        {readinessIssues?.length ? (
          <>
            <p className="mt-2 text-sm text-slate-500">Resolve these items before publishing.</p>
            <ul className="mt-4 divide-y divide-slate-100">
              {readinessIssues.map((issue, index) => (
                <li key={index}>
                  <button
                    type="button"
                    className="flex w-full items-center justify-between gap-3 py-3 text-left text-sm text-slate-700 hover:text-brand-600"
                    onClick={() => {
                      setReadinessIssues(null)
                      setEditorTab(issue.section)
                      const target =
                        issue.moduleIndex === undefined ? undefined : modules[issue.moduleIndex]
                      if (target) {
                        setSelectedModuleId(target.id)
                        setExpandedModules((previous) =>
                          previous.includes(target.id) ? previous : [...previous, target.id],
                        )
                        setCurriculumSearch('')
                        if (issue.lessonIndex !== undefined && target.lessons[issue.lessonIndex])
                          chooseLesson(target, target.lessons[issue.lessonIndex])
                        else if (!target.title.trim()) setModuleEditorId(target.id)
                      }
                    }}
                  >
                    <span>
                      {issue.moduleIndex !== undefined && (
                        <span className="mb-1 block text-xs text-slate-500">
                          Module {issue.moduleIndex + 1}
                          {issue.lessonIndex !== undefined
                            ? ' · Lesson ' + (issue.lessonIndex + 1)
                            : ''}
                        </span>
                      )}
                      {issue.message}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" />
                  </button>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <div className="flex gap-3 py-6">
            <CheckCircle2 className="h-6 w-6 shrink-0 text-emerald-600" />
            <div>
              <p className="font-medium">Publication requirements met</p>
              <p className="mt-1 text-sm text-slate-500">
                Review the lesson content, then publish when you’re ready.
              </p>
            </div>
          </div>
        )}
      </dialog>
      <dialog
        ref={removalDialogRef}
        aria-labelledby="remove-module-title"
        className="w-[min(92vw,420px)] rounded-2xl border-0 p-6 shadow-xl backdrop:bg-navy/30"
        onCancel={() => setPendingModuleRemoval(null)}
        onClose={() => setPendingModuleRemoval(null)}
      >
        <h3 id="remove-module-title" className="text-lg font-semibold">
          Remove module?
        </h3>
        <p className="mt-2 text-sm text-slate-500">
          This removes “{pendingModuleRemoval?.title || 'Untitled module'}” and its lessons from
          this draft. Save the course to apply the change.
        </p>
        <div className="mt-6 flex justify-end gap-3">
          <button
            type="button"
            className={secondaryClass}
            onClick={() => setPendingModuleRemoval(null)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-xl bg-rose-600 px-4 py-2 text-sm font-semibold text-white"
            onClick={() => {
              if (pendingModuleRemoval) removeModule(pendingModuleRemoval)
            }}
          >
            Remove module
          </button>
        </div>
      </dialog>
      <dialog
        ref={leaveDialogRef}
        aria-labelledby="leave-course-title"
        className="w-[min(92vw,420px)] rounded-2xl border-0 p-6 shadow-xl backdrop:bg-navy/40"
        onClose={() => setLeaveHref('')}
        onCancel={() => setLeaveHref('')}
      >
        <h3 id="leave-course-title" className="text-lg font-semibold">
          Discard unsaved changes?
        </h3>
        <p className="mt-2 text-sm text-slate-500">Your latest course edits have not been saved.</p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button type="button" className={secondaryClass} onClick={() => setLeaveHref('')}>
            Keep editing
          </button>
          <button
            type="button"
            className={primaryClass}
            onClick={() => {
              setDirty(false)
              setLeaveHref('')
              router.push(leaveHref)
            }}
          >
            Leave without saving
          </button>
        </div>
      </dialog>
      <form
        ref={editorFormRef}
        noValidate
        onSubmit={(e) => save(e, existing?.status || 'draft')}
        onInputCapture={(e) => {
          const target = e.target as Element
          if (!['file', 'search'].includes(target.getAttribute('type') || '')) markDirty()
        }}
        onChangeCapture={(e) => {
          const target = e.target as Element
          if (!['file', 'search'].includes(target.getAttribute('type') || '')) markDirty()
        }}
        className="space-y-4"
      >
        <div
          ref={actionBarRef}
          className="sticky top-16 z-20 rounded-xl border border-slate-200 bg-white/95 px-4 py-3 backdrop-blur"
        >
          <div className="flex items-center justify-between gap-4 pb-3">
            <div className="flex min-w-0 flex-1 items-center gap-3">
              <Link
                href={`/${role}/courses`}
                aria-label="Back to courses"
                title="Back to courses"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-50 hover:text-slate-800"
              >
                <ArrowLeft className="h-4 w-4" />
              </Link>
              <div className="min-w-0">
                <h2 className="truncate text-base font-semibold text-navy" title={title}>
                  {title || 'New course'}
                </h2>
                <span
                  role="status"
                  className={`text-xs ${dirty ? 'text-amber-700' : 'text-slate-500'}`}
                >
                  {saving
                    ? 'Saving…'
                    : uploading || resourceUploads > 0
                      ? 'Uploading…'
                      : dirty
                        ? 'Unsaved changes'
                        : savedRevision
                          ? 'All changes saved'
                          : 'New draft'}
                </span>
              </div>
            </div>
            {savedRevision && (
              <Link
                href={`/${role}/courses/${courseId}`}
                className="shrink-0 text-xs font-medium text-brand-600 hover:underline sm:text-sm"
              >
                Preview course
              </Link>
            )}
          </div>
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3">
            <div
              role="tablist"
              aria-label="Course editor sections"
              className="flex min-w-0 flex-wrap gap-1"
            >
              {['details', 'curriculum', 'settings'].map((tab, index) => (
                <button
                  key={tab}
                  type="button"
                  role="tab"
                  id={`course-tab-${tab}`}
                  aria-selected={editorTab === tab}
                  aria-controls={`course-panel-${tab}`}
                  tabIndex={editorTab === tab ? 0 : -1}
                  disabled={navigationBusy || (tab === 'curriculum' && !id && !title.trim())}
                  onKeyDown={(e) => {
                    if (['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) {
                      e.preventDefault()
                      const tabs = ['details', 'curriculum', 'settings']
                      let next =
                        e.key === 'Home'
                          ? 0
                          : e.key === 'End'
                            ? 2
                            : (index + (e.key === 'ArrowRight' ? 1 : 2)) % 3
                      const buttons = e.currentTarget.parentElement?.querySelectorAll('button')
                      const direction = e.key === 'ArrowLeft' ? 2 : 1
                      for (let attempt = 0; attempt < 3 && buttons?.[next]?.disabled; attempt++)
                        next = (next + direction) % 3
                      if (buttons?.[next]?.disabled) return
                      setEditorTab(tabs[next])
                      ;(
                        e.currentTarget.parentElement?.querySelectorAll('button')[
                          next
                        ] as HTMLButtonElement
                      )?.focus()
                    }
                  }}
                  onClick={() => setEditorTab(tab)}
                  className={`rounded-lg px-2 py-2 text-xs font-medium sm:px-3 sm:text-sm ${editorTab === tab ? 'bg-brand-50 text-brand-700' : 'text-slate-500 hover:bg-slate-50'}`}
                >
                  {tab === 'details'
                    ? 'Course details'
                    : tab === 'curriculum'
                      ? 'Curriculum'
                      : 'Settings'}
                </button>
              ))}
            </div>
            <div className="ml-auto flex max-w-full flex-wrap items-center justify-end gap-2">
              <button
                type="button"
                title="Check publication requirements"
                aria-label="Check publication requirements"
                className="rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40"
                disabled={navigationBusy}
                onClick={reviewCourse}
              >
                Review
              </button>
              <button
                type="submit"
                className={`${primaryClass} !px-3 !py-2`}
                disabled={navigationBusy}
              >
                {saving
                  ? 'Saving…'
                  : existing?.status === 'published' || existing?.status === 'archived'
                    ? 'Save changes'
                    : 'Save draft'}
              </button>
              {existing?.status !== 'published' && (
                <button
                  type="button"
                  className={`${secondaryClass} !px-3 !py-2`}
                  disabled={navigationBusy}
                  onClick={(e) => void save(e, 'published')}
                >
                  Publish course
                </button>
              )}
            </div>
          </div>
          {saveError && (
            <div
              role="alert"
              className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700"
            >
              {saveError}
            </div>
          )}
        </div>
        <fieldset disabled={saving}>
          <div
            role="tabpanel"
            id="course-panel-details"
            aria-labelledby="course-tab-details"
            hidden={editorTab !== 'details'}
          >
            <div className="grid lg:grid-cols-3 gap-6">
              <Panel className="lg:col-span-2 space-y-5">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-semibold">Course details</h3>
                  {!id && (
                    <Link
                      href={`/${role}/courses/ai`}
                      className="text-sm font-medium text-brand-600 hover:text-brand-700"
                    >
                      Create with AI
                    </Link>
                  )}
                </div>
                <Field label="Course title">
                  <input
                    className={inputClass}
                    autoFocus={!id}
                    required
                    maxLength={160}
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="e.g. Cybersecurity fundamentals"
                  />
                </Field>
                {!id && !title.trim() && (
                  <p className="text-xs text-slate-400">
                    Start with a course title to unlock the curriculum.
                  </p>
                )}
                <Field label="Description">
                  <textarea
                    className={inputClass}
                    maxLength={20000}
                    rows={5}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder="What will students learn, and who is this for?"
                  />
                </Field>
                <div className="grid sm:grid-cols-2 gap-4">
                  <Field label="Category">
                    <select
                      className={inputClass}
                      value={category}
                      disabled={!state.categories.length && !category}
                      onChange={(e) => {
                        categoryTouched.current = true
                        setCategory(e.target.value as CourseCategory)
                      }}
                    >
                      {!category && !state.categories.length && (
                        <option value="">
                          {optionsReady ? 'No categories available' : 'Loading categories…'}
                        </option>
                      )}
                      {category && !state.categories.includes(category) && (
                        <option value={category} disabled>
                          {category} (unavailable)
                        </option>
                      )}
                      {state.categories.map((c) => (
                        <option key={c}>{c}</option>
                      ))}
                    </select>
                  </Field>
                  <Field label="Level">
                    <select
                      className={inputClass}
                      value={level}
                      onChange={(e) => setLevel(e.target.value as CourseLevel)}
                    >
                      {['Beginner', 'Intermediate', 'Advanced'].map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </Field>
                </div>
              </Panel>
              <Panel className="space-y-5 h-fit">
                <CourseThumbnail
                  courseId={courseId}
                  value={thumbnail}
                  onChange={(value) => {
                    markDirty()
                    setThumbnail(value)
                  }}
                  onBusy={setUploading}
                />
              </Panel>
            </div>
          </div>
          <div
            role="tabpanel"
            id="course-panel-settings"
            aria-labelledby="course-tab-settings"
            hidden={editorTab !== 'settings'}
            style={editorTab !== 'settings' ? { display: 'none' } : undefined}
            className="grid gap-6 xl:grid-cols-2 items-start"
          >
            <Panel className="space-y-5">
              <h3 className="font-semibold">Access & instructor</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <Field label="Price (USD)">
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    step="0.01"
                    value={price}
                    onChange={(e) => setPrice(Number(e.target.value))}
                  />
                </Field>
                <Field label="Duration (hours)">
                  <input
                    className={inputClass}
                    type="number"
                    min={0}
                    step="0.1"
                    max={10000}
                    value={duration}
                    onChange={(e) => setDuration(Number(e.target.value))}
                  />
                </Field>
              </div>
              {role === 'admin' && (
                <Field label="Instructor">
                  <select
                    className={inputClass}
                    value={tutorId}
                    onChange={(e) => {
                      tutorTouched.current = true
                      setTutorId(e.target.value)
                    }}
                  >
                    {!tutorId && (
                      <option value="">
                        {optionsReady ? 'Select instructor' : 'Loading instructors…'}
                      </option>
                    )}
                    {tutorId &&
                      !state.users.some(
                        (u) => u.id === tutorId && u.role === 'tutor' && u.isActive,
                      ) && (
                        <option value={tutorId} disabled>
                          Selected instructor unavailable
                        </option>
                      )}
                    {state.users
                      .filter((u) => u.role === 'tutor' && u.isActive)
                      .map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.name}
                        </option>
                      ))}
                  </select>
                </Field>
              )}
            </Panel>
            <Panel className="space-y-5">
              <h3 className="font-semibold">Completion & certificates</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 items-start">
                <Field label="Course completion">
                  <select
                    className={inputClass}
                    value={completionRule}
                    disabled={!!existing?.enrolledCount}
                    onChange={(e) => {
                      setCompletionRule(e.target.value as Course['completionRule'])
                      setRequireAssessment(e.target.value !== 'lessons')
                    }}
                  >
                    {Object.entries(COMPLETION_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Certificates">
                  <select
                    className={inputClass}
                    value={certificateMode}
                    disabled={!!existing?.enrolledCount}
                    onChange={(e) =>
                      setCertificateMode(e.target.value as Course['certificateMode'])
                    }
                  >
                    {Object.entries(CERTIFICATE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>
              <p className="text-xs text-slate-500">
                {COMPLETION_RULES[completionRule || 'lessons_pass']}.{' '}
                {CERTIFICATE_MODES[certificateMode || 'automatic']}.
              </p>
              <p className="text-xs text-slate-400">
                Rules lock after enrollment. Draft quizzes do not count.
              </p>
            </Panel>
          </div>
          <div
            role="tabpanel"
            id="course-panel-curriculum"
            aria-labelledby="course-tab-curriculum"
            hidden={editorTab !== 'curriculum'}
          >
            <div className="mx-auto max-w-6xl space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 pt-3">
                <div>
                  <h2 className="text-2xl font-semibold tracking-tight text-navy">Curriculum</h2>
                  <p className="mt-1 text-sm text-slate-500">
                    {modules.length} {modules.length === 1 ? 'module' : 'modules'} ·{' '}
                    {lessonPath.length} {lessonPath.length === 1 ? 'lesson' : 'lessons'}
                  </p>
                </div>
                <button
                  type="button"
                  className={primaryClass}
                  disabled={locked || navigationBusy || modules.length >= 100}
                  onClick={addModule}
                >
                  <Plus className="h-4 w-4" />
                  Add module
                </button>
              </div>
              {locked && (
                <p className="rounded-xl bg-amber-50 p-3 text-sm text-amber-800">
                  Curriculum is locked while learners are enrolled. You can still update PDF
                  resources.
                </p>
              )}
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="relative w-full sm:w-80">
                  <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
                  <input
                    type="search"
                    aria-label="Search curriculum"
                    placeholder="Find a module or lesson"
                    className={inputClass + ' !pl-9 !py-2.5 !text-sm'}
                    value={curriculumSearch}
                    disabled={navigationBusy}
                    onChange={(e) => setCurriculumSearch(e.target.value)}
                  />
                </div>
                <div className="flex items-center gap-4 text-xs font-medium text-slate-500">
                  <button
                    type="button"
                    disabled={navigationBusy || !!curriculumSearch.trim()}
                    onClick={() => setExpandedModules(modules.map((m) => m.id))}
                  >
                    Expand all
                  </button>
                  <button
                    type="button"
                    disabled={navigationBusy || !!curriculumSearch.trim()}
                    onClick={() => setExpandedModules([])}
                  >
                    Collapse all
                  </button>
                </div>
              </div>
              <div className="space-y-4" aria-label="Curriculum modules">
                {modules
                  .filter(
                    (m) =>
                      !curriculumSearch.trim() ||
                      m.title.toLowerCase().includes(curriculumSearch.trim().toLowerCase()) ||
                      m.lessons.some((l) =>
                        l.title.toLowerCase().includes(curriculumSearch.trim().toLowerCase()),
                      ),
                  )
                  .map((m) => {
                    const mi = modules.indexOf(m)
                    const expanded = !!curriculumSearch.trim() || expandedModules.includes(m.id)
                    const renaming = moduleEditorId === m.id
                    const query = curriculumSearch.trim().toLowerCase()
                    return (
                      <section
                        key={m.id}
                        aria-label={'Module ' + (mi + 1) + ': ' + (m.title || 'Untitled module')}
                        className="overflow-hidden rounded-xl border border-slate-200 bg-white"
                      >
                        <div className="flex items-center gap-3 bg-slate-50/80 px-4 py-3 sm:px-5">
                          <button
                            type="button"
                            aria-label={(expanded ? 'Collapse' : 'Expand') + ' module ' + (mi + 1)}
                            aria-expanded={expanded}
                            aria-controls={'curriculum-module-' + m.id}
                            disabled={navigationBusy || !!query}
                            className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
                            onClick={() =>
                              setExpandedModules((previous) =>
                                expanded
                                  ? previous.filter((value) => value !== m.id)
                                  : [...previous, m.id],
                              )
                            }
                          >
                            <ChevronDown
                              className={
                                'h-4 w-4 transition-transform ' + (expanded ? '' : '-rotate-90')
                              }
                            />
                          </button>
                          <div className="min-w-0 flex-1">
                            <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-slate-500">
                              Module {mi + 1} · {m.lessons.length}{' '}
                              {m.lessons.length === 1 ? 'lesson' : 'lessons'}
                            </p>
                            <h3
                              className="truncate text-base font-semibold text-navy"
                              title={m.title}
                            >
                              {m.title || 'Untitled module'}
                            </h3>
                          </div>
                          <button
                            type="button"
                            aria-label={'Rename module ' + (mi + 1)}
                            title="Rename module"
                            disabled={locked || navigationBusy}
                            className="rounded-lg p-2 text-slate-500 hover:bg-white hover:text-brand-600 disabled:opacity-40"
                            onClick={() => {
                              setSelectedModuleId(m.id)
                              setModuleEditorId(renaming ? '' : m.id)
                              focusTarget.current = 'module'
                              focusLesson.current = true
                              setSelectionTick((tick) => tick + 1)
                            }}
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            aria-label={'Remove module ' + (mi + 1)}
                            title="Remove module"
                            disabled={locked || navigationBusy}
                            className="rounded-lg p-2 text-slate-500 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-40"
                            onClick={() => requestModuleRemoval(m)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                        {renaming && (
                          <div className="flex items-end gap-3 border-t border-slate-100 px-4 py-4 sm:px-6">
                            <div className="min-w-0 flex-1">
                              <Field label="Module title">
                                <input
                                  ref={moduleTitleRef}
                                  aria-label={'Module ' + (mi + 1) + ' title'}
                                  className={inputClass}
                                  maxLength={200}
                                  placeholder="Module title"
                                  value={m.title}
                                  disabled={locked || navigationBusy}
                                  onChange={(e) =>
                                    changeModules(
                                      modules.map((entry) =>
                                        entry.id === m.id
                                          ? { ...entry, title: e.target.value }
                                          : entry,
                                      ),
                                    )
                                  }
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') {
                                      e.preventDefault()
                                      if (m.title.trim()) setModuleEditorId('')
                                    }
                                  }}
                                />
                              </Field>
                            </div>
                            <button
                              type="button"
                              className={secondaryClass}
                              disabled={navigationBusy || !m.title.trim()}
                              onClick={() => setModuleEditorId('')}
                            >
                              Done
                            </button>
                          </div>
                        )}
                        {expanded && (
                          <div
                            id={'curriculum-module-' + m.id}
                            className="my-2 ml-8 mr-3 space-y-1 sm:ml-12 sm:mr-5"
                          >
                            {m.lessons
                              .filter(
                                (l) =>
                                  !query ||
                                  m.title.toLowerCase().includes(query) ||
                                  l.title.toLowerCase().includes(query),
                              )
                              .map((l) => (
                                <button
                                  key={l.id}
                                  type="button"
                                  aria-label={
                                    'Edit lesson ' +
                                    (mi + 1) +
                                    '.' +
                                    (m.lessons.indexOf(l) + 1) +
                                    ': ' +
                                    (l.title || 'Untitled lesson')
                                  }
                                  disabled={navigationBusy}
                                  title="Edit lesson"
                                  className="group flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-brand-50 disabled:opacity-40"
                                  onClick={() => chooseLesson(m, l)}
                                >
                                  <span className="flex h-8 w-8 shrink-0 items-center justify-center text-slate-500 group-hover:text-brand-600">
                                    {l.type === 'video' ? (
                                      <Play className="h-5 w-5" />
                                    ) : l.type === 'quiz' ? (
                                      <CheckCircle2 className="h-5 w-5" />
                                    ) : (
                                      <FileText className="h-5 w-5" />
                                    )}
                                  </span>
                                  <span className="min-w-0 flex-1">
                                    <span
                                      className="block text-sm font-medium leading-5 text-slate-800"
                                      title={l.title}
                                    >
                                      {l.title || 'Untitled lesson'}
                                    </span>
                                    <span className="mt-0.5 block text-xs text-slate-500">
                                      {mi + 1}.{m.lessons.indexOf(l) + 1} ·{' '}
                                      {l.type === 'video'
                                        ? 'Video'
                                        : l.type === 'quiz'
                                          ? 'Quiz'
                                          : 'Reading'}{' '}
                                      · {l.duration} min
                                    </span>
                                  </span>
                                  <Pencil className="h-4 w-4 shrink-0 text-slate-500 group-hover:text-brand-600" />
                                </button>
                              ))}
                            {!m.lessons.length && (
                              <p className="px-3 py-3 text-sm text-slate-500">No lessons yet.</p>
                            )}
                            <button
                              type="button"
                              aria-label={'Add lesson to module ' + (mi + 1)}
                              disabled={
                                locked ||
                                navigationBusy ||
                                !m.title.trim() ||
                                m.lessons.length >= 100 ||
                                lessonPath.length >= 500
                              }
                              className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-brand-600 hover:bg-brand-50 disabled:opacity-40"
                              onClick={() => addLesson(m)}
                            >
                              + Add lesson
                            </button>
                          </div>
                        )}
                      </section>
                    )
                  })}
                {!modules.length && (
                  <div className="rounded-xl border border-dashed border-slate-200 bg-white py-16 text-center">
                    <h3 className="font-semibold">Build your curriculum</h3>
                    <p className="mt-2 text-sm text-slate-500">Start with your first module.</p>
                    <button
                      type="button"
                      className={primaryClass + ' mt-5'}
                      disabled={locked || navigationBusy}
                      onClick={addModule}
                    >
                      Add first module
                    </button>
                  </div>
                )}
                {!!modules.length &&
                  !!curriculumSearch.trim() &&
                  !modules.some(
                    (m) =>
                      m.title.toLowerCase().includes(curriculumSearch.trim().toLowerCase()) ||
                      m.lessons.some((l) =>
                        l.title.toLowerCase().includes(curriculumSearch.trim().toLowerCase()),
                      ),
                  ) && (
                    <p className="py-12 text-center text-sm text-slate-400">
                      No matching modules or lessons.
                    </p>
                  )}
              </div>
            </div>
            <dialog
              ref={lessonDialogRef}
              aria-labelledby="lesson-editor-title"
              className={`fixed inset-0 m-auto max-h-[94dvh] max-w-none overflow-hidden rounded-2xl border border-slate-200 bg-white p-0 shadow-2xl backdrop:bg-navy/30 backdrop:backdrop-blur-sm ${lessonEditorExpanded ? 'w-[min(96vw,1400px)]' : 'w-[min(96vw,960px)]'}`}
              onCancel={(e) => {
                e.preventDefault()
                closeLessonEditor()
              }}
              onClose={() => {
                if (!navigationBusy) setLessonEditorOpen(false)
              }}
            >
              {lessonEditorOpen && selectedModule && selectedLesson && (
                <div
                  className={`flex max-h-[94dvh] flex-col ${lessonEditorExpanded ? 'h-[94dvh]' : ''}`}
                >
                  <div className="flex shrink-0 items-center justify-between gap-4 border-b border-slate-200 px-5 py-4 sm:px-7">
                    <div className="min-w-0">
                      <p className="truncate text-xs text-slate-400">
                        {selectedModule.title || 'Untitled module'} · Lesson {lessonIndex + 1} of{' '}
                        {lessonPath.length}
                      </p>
                      <h3
                        id="lesson-editor-title"
                        ref={lessonHeadingRef}
                        tabIndex={-1}
                        className="mt-1 truncate text-lg font-semibold outline-none"
                      >
                        {selectedLesson.title || 'New lesson'}
                      </h3>
                    </div>
                    <button
                      type="button"
                      aria-label="Close lesson editor"
                      className="rounded-lg p-2 text-slate-400 hover:bg-slate-50"
                      disabled={navigationBusy}
                      onClick={closeLessonEditor}
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>
                  <div
                    ref={lessonBodyRef}
                    className={`min-h-0 px-5 py-5 sm:px-7 ${lessonEditorExpanded ? 'flex flex-1 flex-col overflow-hidden' : 'space-y-5 overflow-y-auto overscroll-contain'}`}
                  >
                    <fieldset
                      disabled={locked || saving}
                      className={
                        lessonEditorExpanded ? 'flex min-h-0 min-w-0 flex-1 flex-col' : 'space-y-4'
                      }
                    >
                      <div hidden={lessonEditorExpanded} className="space-y-4">
                        <Field label="Lesson title">
                          <input
                            ref={lessonTitleRef}
                            style={{
                              scrollMarginTop:
                                'calc(4rem + var(--course-toolbar-height, 6rem) + 1.5rem)',
                            }}
                            aria-label="Lesson title"
                            className={`${inputClass} !py-2 !text-base !font-medium`}
                            maxLength={200}
                            placeholder="Lesson title"
                            value={selectedLesson.title}
                            onChange={(e) => changeLesson({ title: e.target.value })}
                          />
                        </Field>
                        <div className="grid grid-cols-[minmax(0,180px)_112px] gap-3">
                          <Field label="Lesson type">
                            <select
                              aria-label="Lesson type"
                              className={inputClass}
                              value={selectedLesson.type}
                              onChange={(e) =>
                                changeLesson({ type: e.target.value as Lesson['type'] })
                              }
                            >
                              {['reading', 'video', 'quiz'].map((type) => (
                                <option key={type} value={type}>
                                  {type === 'reading'
                                    ? 'Reading'
                                    : type === 'video'
                                      ? 'Video'
                                      : 'Quiz'}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field label="Duration (min)">
                            <input
                              aria-label="Lesson duration in minutes"
                              className={inputClass}
                              type="number"
                              min={0}
                              max={1440}
                              value={selectedLesson.duration}
                              onChange={(e) => changeLesson({ duration: Number(e.target.value) })}
                            />
                          </Field>
                        </div>
                        {selectedLesson.type === 'video' && (
                          <Field label="Video URL">
                            <input
                              type="url"
                              aria-label="Video URL"
                              maxLength={2048}
                              placeholder="https://… direct video URL"
                              className={inputClass}
                              value={selectedLesson.videoUrl || ''}
                              onChange={(e) => changeLesson({ videoUrl: e.target.value })}
                            />
                          </Field>
                        )}
                      </div>
                      <LessonRichEditor
                        key={selectedLesson.id}
                        label={`Lesson guide for ${selectedLesson.title || 'new lesson'}`}
                        value={selectedLesson.content || ''}
                        disabled={saving || locked}
                        expanded={lessonEditorExpanded}
                        onExpandedChange={setLessonEditorExpanded}
                        onChange={(content) => changeLesson({ content })}
                      />
                    </fieldset>
                    <div hidden={lessonEditorExpanded}>
                      <LessonResources
                        key={selectedLesson.id}
                        lessonId={selectedLesson.id}
                        editable
                        saved={savedLessons.includes(selectedLesson.id)}
                        onUploadStateChange={(active) =>
                          setResourceUploads((count) => Math.max(0, count + (active ? 1 : -1)))
                        }
                        beforeUpload={async () => {
                          if (!savedLessons.includes(selectedLesson.id))
                            await save(
                              { preventDefault() {} } as React.FormEvent,
                              existing?.status || 'draft',
                              true,
                            )
                        }}
                      />
                    </div>
                  </div>
                  {lessonRemovalOpen && (
                    <div
                      role="alert"
                      className="mx-5 my-2 shrink-0 rounded-xl border border-rose-200 bg-rose-50 p-4 sm:mx-7"
                    >
                      <p className="text-sm font-medium text-slate-800">
                        Remove this lesson from the curriculum?
                      </p>
                      <div className="mt-3 flex gap-4">
                        <button
                          type="button"
                          disabled={navigationBusy}
                          className="text-sm font-semibold text-rose-600"
                          onClick={removeLesson}
                        >
                          Confirm remove lesson
                        </button>
                        <button
                          type="button"
                          className="text-sm text-slate-500"
                          onClick={() => setLessonRemovalOpen(false)}
                        >
                          Keep lesson
                        </button>
                      </div>
                    </div>
                  )}
                  {saveError && (
                    <p
                      role="alert"
                      className="mx-5 my-2 shrink-0 rounded-lg bg-rose-50 p-3 text-sm text-rose-700 sm:mx-7"
                    >
                      {saveError}
                    </p>
                  )}
                  <div className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-white px-5 py-4 sm:px-7">
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        aria-label="Previous lesson"
                        title="Previous lesson"
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"
                        disabled={navigationBusy || lessonIndex <= 0}
                        onClick={() => {
                          const previous = lessonPath[lessonIndex - 1]
                          if (previous) chooseLesson(previous.module, previous.lesson)
                        }}
                      >
                        <ChevronLeft className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Next lesson"
                        title="Next lesson"
                        className="rounded-lg border border-slate-200 p-2 text-slate-500 disabled:opacity-30"
                        disabled={
                          navigationBusy || lessonIndex < 0 || lessonIndex >= lessonPath.length - 1
                        }
                        onClick={() => {
                          const next = lessonPath[lessonIndex + 1]
                          if (next) chooseLesson(next.module, next.lesson)
                        }}
                      >
                        <ChevronRight className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        aria-label="Remove lesson"
                        className="ml-2 text-xs text-slate-400 hover:text-rose-600 disabled:opacity-40"
                        disabled={locked || navigationBusy}
                        onClick={() => setLessonRemovalOpen(true)}
                      >
                        Remove lesson
                      </button>
                    </div>
                    <div className="flex items-center gap-3">
                      <span role="status" className="hidden text-xs text-slate-400 sm:block">
                        {saving
                          ? 'Saving…'
                          : resourceUploads
                            ? 'Uploading…'
                            : dirty
                              ? 'Unsaved changes'
                              : 'All changes saved'}
                      </span>
                      <button
                        type="button"
                        className={secondaryClass}
                        disabled={navigationBusy}
                        onClick={(e) =>
                          void save(e, existing?.status || 'draft', true).catch(() => {})
                        }
                      >
                        {saving ? 'Saving…' : 'Save course'}
                      </button>
                      <button
                        type="button"
                        className={primaryClass}
                        disabled={navigationBusy}
                        onClick={closeLessonEditor}
                      >
                        Done
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </dialog>
          </div>
        </fieldset>
      </form>
    </FeatureShell>
  )
}
