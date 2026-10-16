'use client'

import React, { useState } from 'react'
import { Download } from 'lucide-react'
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  BarChart,
  Bar,
} from 'recharts'
import { useLms, csv, downloadText } from '@/lib/lms/store'
import { FeatureShell, Heading, Panel, secondaryClass, inputClass } from './common'
import { StatCard, ProgressBar } from '@/components/shared/ui'
import { formatCurrency } from '@/lib/utils'
import type { Role } from '@/types'
export function Analytics({ role }: { role: Role }) {
  const { state, user: currentUser } = useLms()
  const [range, setRange] = useState('6')
  const [metric, setMetric] = useState('enrollments')

  const courses = state.courses.filter((c) => role === 'admin' || c.tutorId === currentUser.id)
  const enrollments = state.enrollments.filter((e) => courses.some((c) => c.id === e.courseId))
  const data = state.summary.monthly.slice(-Number(range))
  const completed = enrollments.filter((e) => !!e.completedAt).length
  const revenue = data.reduce((a, d) => a + d.revenue, 0)
  return (
    <FeatureShell role={role} title="Analytics">
      <Heading title="Analytics">
        <div className="flex gap-3">
          <select
            className={`${inputClass} !w-auto`}
            aria-label="Reporting period"
            value={range}
            onChange={(e) => setRange(e.target.value)}
          >
            <option value="3">Last 3 months</option>
            <option value="6">Last 6 months</option>
            <option value="10">All months</option>
          </select>
          <button
            className={secondaryClass}
            onClick={() =>
              downloadText(
                'cyberpurview-analytics.csv',
                csv([
                  ['Month', 'Revenue (USD)', 'Enrollments'],
                  ...data.map((d) => [d.month, d.revenue, d.enrollments]),
                ]),
                'text/csv',
              )
            }
          >
            <Download className="w-4 h-4" />
            Export
          </button>
        </div>
      </Heading>
      <div className="grid sm:grid-cols-2 xl:grid-cols-4 gap-5 mb-6">
        <StatCard title="Payments not connected" value={formatCurrency(revenue)} />
        <StatCard title="Courses" value={state.summary.courses} />
        <StatCard title="Enrollments" value={state.summary.enrollments} />
        <StatCard
          title="Completion rate"
          value={`${state.summary.enrollments ? Math.round((state.summary.completed / state.summary.enrollments) * 100) : 0}%`}
        />
      </div>
      <div className="grid lg:grid-cols-3 gap-6">
        <Panel className="lg:col-span-2">
          <div className="flex justify-between items-center mb-6">
            <div>
              <h3 className="font-semibold">Growth over time</h3>
              <p className="text-xs text-slate-400 mt-1">
                Enrollment activity · payments not connected
              </p>
            </div>
            <select
              className={`${inputClass} !w-auto`}
              aria-label="Chart metric"
              value={metric}
              onChange={(e) => setMetric(e.target.value)}
            >
              <option value="revenue">Revenue</option>
              <option value="enrollments">Enrollments</option>
            </select>
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data}>
                <defs>
                  <linearGradient id="analytics-fill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--brand-primary)" stopOpacity={0.2} />
                    <stop offset="100%" stopColor="var(--brand-primary)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                <XAxis
                  dataKey="month"
                  axisLine={false}
                  tickLine={false}
                  tick={{ fontSize: 12, fill: '#94a3b8' }}
                />
                <YAxis
                  width={55}
                  axisLine={false}
                  tickLine={false}
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
                  dataKey={metric}
                  stroke="var(--brand-primary)"
                  strokeWidth={3}
                  fill="url(#analytics-fill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Panel>
        <Panel>
          <h3 className="font-semibold mb-5">Learning outcomes · loaded records</h3>
          {[
            { label: 'Completed', count: completed, color: 'bg-emerald-500' },
            {
              label: 'In progress',
              count: enrollments.filter((e) => e.progress > 0 && !e.completedAt).length,
              color: 'bg-brand-500',
            },
            {
              label: 'Not started',
              count: enrollments.filter((e) => e.progress === 0).length,
              color: 'bg-amber-500',
            },
          ].map((d) => (
            <div key={d.label} className="mb-6">
              <div className="flex justify-between text-sm text-slate-500 mb-2">
                <span>{d.label}</span>
                <span className="font-semibold text-slate-800">{d.count}</span>
              </div>
              <ProgressBar
                value={enrollments.length ? (d.count / enrollments.length) * 100 : 0}
                color={d.color}
              />
            </div>
          ))}
          <p className="text-xs text-slate-400 leading-5">
            Learning outcomes update as you enroll in and complete courses on the platform.
          </p>
        </Panel>
      </div>
      <Panel className="mt-6">
        <h3 className="font-semibold mb-5">Course enrollment comparison</h3>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart
              data={courses.map((c) => ({ name: c.category, enrollments: c.enrolledCount }))}
            >
              <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
              <XAxis
                dataKey="name"
                tick={{ fontSize: 10, fill: '#94a3b8' }}
                axisLine={false}
                tickLine={false}
              />
              <YAxis tick={{ fontSize: 12, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
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
              <Bar dataKey="enrollments" fill="#818cf8" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </Panel>
    </FeatureShell>
  )
}
