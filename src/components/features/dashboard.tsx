'use client'
import { learnerCourseUrl } from '@/lib/lms/course-url'
import Link from 'next/link'
import React from 'react'
import { Award, ArrowUpRight, ArrowRight, FileText } from 'lucide-react'
import Image from 'next/image'
import { AreaChart, Area, XAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import { useLms } from '@/lib/lms/store'
import { FeatureShell, Heading, Panel, primaryClass, secondaryClass, Empty } from './common'
import { StatCard, ProgressBar, Badge } from '@/components/shared/ui'
import type { Role } from '@/types'
export function Dashboard({ role }: { role: Role }) {
  const { state, user: currentUser } = useLms()
  const user = state.users.find((u) => u.id === currentUser.id)!
  const learner = role === 'learner'
  const courses = state.courses.filter((c) =>
    learner
      ? state.enrollments.some((e) => e.learnerId === user.id && e.courseId === c.id)
      : role === 'admin' || c.tutorId === user.id,
  )
  const enrollments = state.enrollments.filter((e) =>
    learner ? e.learnerId === user.id : courses.some((c) => c.id === e.courseId),
  )
  const certs = state.certificates.filter((c) => !learner || c.learnerId === user.id)
  const ongoing = enrollments.filter((e) => !e.completedAt)
  const completed = enrollments.filter((e) => !!e.completedAt)
  const attempts = state.attempts.filter((a) =>
    learner
      ? a.learnerId === user.id
      : state.quizzes.some((q) => q.id === a.quizId && courses.some((c) => c.id === q.courseId)),
  )
  const notes = state.notifications.filter((n) => n.userId === user.id)
  const average = enrollments.length
    ? Math.round(enrollments.reduce((a, e) => a + e.progress, 0) / enrollments.length)
    : 0
  const totals = state.summary
  const chartData = totals.monthly
  const recommended = state.courses
    .filter((c) => c.status === 'published' && !courses.some((x) => x.id === c.id))
    .slice(0, 3)
  const continueCourse = courses.find((c) => ongoing.some((e) => e.courseId === c.id))
  const stats = learner
    ? [
        {
          title: 'Enrolled courses',
          value: totals.courses,
          subtitle: `${totals.enrollments - totals.completed} in progress`,
        },
        {
          title: 'Completed courses',
          value: totals.completed,
          subtitle: undefined,
        },
        {
          title: 'Certificates earned',
          value: totals.certificates,
          subtitle: undefined,
        },
        {
          title: 'Average quiz score',
          value: `${totals.avgScore}%`,
          subtitle: `${totals.quizCount} assessments taken`,
        },
      ]
    : [
        {
          title: role === 'admin' ? 'Community members' : 'Enrolled learners',
          value: totals.users,
          subtitle: undefined,
        },
        {
          title: 'Course library',
          value: totals.courses,
          subtitle: `${totals.published} published courses`,
        },
        {
          title: 'Enrollments',
          value: totals.enrollments,
          subtitle: undefined,
        },
        {
          title: 'Completion rate',
          value: `${totals.enrollments ? Math.round((totals.completed / totals.enrollments) * 100) : 0}%`,
          subtitle: `${totals.completed} completed courses`,
        },
      ]
  return (
    <FeatureShell
      role={role}
      title={learner ? 'My learning' : role === 'admin' ? 'Admin dashboard' : 'Tutor studio'}
    >
      <Heading title={'Welcome back, ' + user.name.replace('Dr. ', '').split(' ')[0] + '.'}>
        <Link
          className={primaryClass}
          href={
            learner
              ? continueCourse
                ? learnerCourseUrl(continueCourse)
                : '/learner/catalog'
              : '/' + role + '/courses/new'
          }
        >
          {learner ? (continueCourse ? 'Continue learning' : 'Browse courses') : 'Create course'}{' '}
          <ArrowRight className="w-4 h-4" />
        </Link>
      </Heading>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-7">
        {stats.map((s) => (
          <StatCard key={s.title} title={s.title} value={s.value} subtitle={s.subtitle} />
        ))}
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 space-y-6">
          {!learner && (
            <Panel>
              <div className="flex justify-between mb-6">
                <div>
                  <h3 className="font-semibold">Enrollment activity</h3>
                </div>
                <Link className="text-sm text-brand-600" href={`/${role}/analytics`}>
                  Explore analytics ↗
                </Link>
              </div>
              <div className="h-56">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartData}>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis
                      dataKey="month"
                      tickLine={false}
                      axisLine={false}
                      tick={{ fontSize: 12, fill: '#94a3b8' }}
                    />
                    <Tooltip
                      contentStyle={{
                        background: 'var(--chart-surface)',
                        borderColor: 'var(--chart-border)',
                        color: 'var(--chart-text)',
                        borderRadius: 12,
                      }}
                      itemStyle={{ color: 'var(--chart-text)' }}
                      labelStyle={{ color: 'var(--chart-text)' }}
                      cursor={{ stroke: 'var(--chart-border)' }}
                    />
                    <Area
                      type="monotone"
                      dataKey="enrollments"
                      stroke="var(--brand-primary)"
                      fill="var(--chart-fill)"
                      strokeWidth={3}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Panel>
          )}
          <Panel>
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-semibold">{learner ? 'Your courses' : 'Course overview'}</h3>
              <Link
                href={`/${role}/courses`}
                className="text-brand-600 text-sm flex gap-1 items-center"
              >
                View all <ArrowUpRight className="w-4 h-4" />
              </Link>
            </div>
            {courses.length ? (
              <div className="space-y-3">
                {courses.slice(0, 4).map((c) => {
                  const enr = enrollments.find((e) => e.courseId === c.id)
                  return (
                    <Link
                      key={c.id}
                      href={learner ? learnerCourseUrl(c, '/learn') : `/${role}/courses/${c.id}`}
                      className="flex items-center gap-4 p-3 sm:p-4 rounded-xl border border-slate-100 hover:border-brand-200 hover:bg-brand-50/30 transition-colors"
                    >
                      {c.thumbnail && (
                        <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-lg">
                          <Image
                            src={c.thumbnail}
                            alt=""
                            fill
                            sizes="80px"
                            className="object-cover"
                          />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <h4 className="text-sm font-semibold text-slate-800 truncate mb-1">
                          {c.title}
                        </h4>
                        <p className="text-xs text-slate-400 mb-2">
                          {learner
                            ? c.tutorName
                            : `${c.category} · ${c.enrolledCount.toLocaleString()} enrollments`}
                        </p>
                        {learner && <ProgressBar value={enr?.progress || 0} />}
                      </div>
                      <span className="text-xs font-medium text-slate-400 shrink-0">
                        {learner ? (
                          `${enr?.progress || 0}%`
                        ) : (
                          <Badge variant={c.status === 'published' ? 'success' : 'default'}>
                            {c.status}
                          </Badge>
                        )}
                      </span>
                      <ArrowRight className="hidden sm:block w-4 h-4 text-slate-400" />
                    </Link>
                  )
                })}
              </div>
            ) : (
              <Empty
                title="No courses yet"
                href={learner ? '/learner/catalog' : `/${role}/courses/new`}
                action={learner ? 'Explore courses' : 'Create course'}
              />
            )}
          </Panel>
        </div>
        <div className="space-y-6">
          <Panel>
            <h3 className="font-semibold mb-5">
              {learner ? 'Your learning progress' : 'Quick actions'}
            </h3>
            {learner ? (
              <>
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-20 h-20 rounded-full border-[6px] border-brand-100 flex items-center justify-center text-xl font-bold text-brand-600">
                    {average}%
                  </div>
                  <div>
                    <p className="text-sm font-medium text-slate-700">Lesson progress</p>
                  </div>
                </div>
                <div className="space-y-2">
                  <Link
                    href="/learner/quizzes"
                    className={`${secondaryClass} w-full justify-start`}
                  >
                    <FileText className="w-4 h-4" />
                    Take an assessment
                  </Link>
                  <Link
                    href="/learner/certificates"
                    className={`${secondaryClass} w-full justify-start`}
                  >
                    <Award className="w-4 h-4" />
                    View certificates
                  </Link>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {[
                  { label: 'New quiz', href: `/${role}/quizzes/new` },
                  { label: 'Assessments', href: `/${role}/quizzes` },
                  {
                    label: role === 'admin' ? 'Manage users' : 'Students',
                    href: role === 'admin' ? '/admin/users' : '/tutor/students',
                  },
                  { label: 'Analytics', href: `/${role}/analytics` },
                ].map((a) => (
                  <Link
                    href={a.href}
                    key={a.label}
                    className="flex items-center justify-between gap-2 border border-slate-100 rounded-xl p-4 hover:bg-brand-50"
                  >
                    <span className="text-sm text-slate-600 font-medium">{a.label}</span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" aria-hidden="true" />
                  </Link>
                ))}
              </div>
            )}
          </Panel>
          <Panel>
            <div className="flex justify-between mb-4">
              <h3 className="font-semibold">Latest updates</h3>
              <Link href={`/${role}/notifications`} className="text-xs text-brand-600">
                View all
              </Link>
            </div>
            {notes.length ? (
              notes.slice(0, 3).map((n) => (
                <Link
                  key={n.id}
                  href={n.href?.startsWith(`/${role}`) ? n.href : `/${role}/notifications`}
                  className="block py-3 border-b border-slate-100 last:border-0"
                >
                  <p className="text-sm font-medium text-slate-800">{n.title}</p>
                  <p className="text-xs text-slate-400 leading-5 mt-1">{n.message}</p>
                </Link>
              ))
            ) : (
              <p className="text-sm text-slate-400">No new updates.</p>
            )}
          </Panel>
        </div>
      </div>
      {learner && recommended.length > 0 && (
        <div className="mt-8">
          <Heading title="Suggested courses">
            <Link href="/learner/catalog" className={secondaryClass}>
              Browse catalog <ArrowRight className="w-4 h-4" />
            </Link>
          </Heading>
          <div className="grid md:grid-cols-3 gap-5">
            {recommended.map((c) => (
              <Link href={learnerCourseUrl(c)} key={c.id}>
                <Panel className="hover:border-brand-300 h-full">
                  <Badge variant="info">{c.category}</Badge>
                  <h3 className="font-semibold mt-4 mb-3">{c.title}</h3>
                  <p className="text-xs text-slate-400">
                    {c.level} · {c.duration} hours
                  </p>
                  <p className="text-sm text-brand-600 mt-5 font-medium">Explore course →</p>
                </Panel>
              </Link>
            ))}
          </div>
        </div>
      )}
    </FeatureShell>
  )
}
