'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { Plus, Download, Copy, Check } from 'lucide-react'
import { useLms, csv, downloadText } from '@/lib/lms/store'
import {
  FeatureShell,
  Heading,
  Panel,
  SearchField,
  Empty,
  Field,
  inputClass,
  primaryClass,
  secondaryClass,
} from './common'
import { Badge, ProgressBar } from '@/components/shared/ui'
import { Modal } from '@/components/shared/Modal'
import type { Role, User } from '@/types'
export function People({ role }: { role: Role }) {
  const { state, mutate, execute, notice, user: currentUser } = useLms()
  const [search, setSearch] = useState('')
  const [filter, setFilter] = useState('All')
  const [editing, setEditing] = useState<User | 'new' | null>(null)
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [userRole, setUserRole] = useState<Role>('learner')
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')
  const [activationLink, setActivationLink] = useState('')
  const [copied, setCopied] = useState(false)
  const tutorCourses = state.courses.filter((c) => c.tutorId === currentUser.id)
  const enrollments = state.enrollments.filter((e) => tutorCourses.some((c) => c.id === e.courseId))
  const base = state.users.filter(
    (u) => role === 'admin' || enrollments.some((e) => e.learnerId === u.id),
  )
  const users = base.filter(
    (u) =>
      `${u.name} ${u.email}`.toLowerCase().includes(search.toLowerCase()) &&
      (filter === 'All' || u.role === filter || (filter === 'Inactive' && !u.isActive)),
  )
  function open(user: User | 'new') {
    setEditing(user)
    setFormError('')
    setActivationLink('')
    setCopied(false)
    setName(user === 'new' ? '' : user.name)
    setEmail(user === 'new' ? '' : user.email)
    setUserRole(user === 'new' ? 'learner' : user.role)
  }
  return (
    <FeatureShell role={role} title={role === 'admin' ? 'User management' : 'Students'}>
      <Heading title={role === 'admin' ? 'Users' : 'Students'}>
        <div className="flex gap-2">
          <button
            className={secondaryClass}
            onClick={() =>
              downloadText(
                'cyberpurview-users.csv',
                csv([
                  ['Name', 'Email', 'Role', 'Status'],
                  ...users.map((u) => [
                    u.name,
                    u.email,
                    u.role,
                    u.isActive ? 'Active' : 'Inactive',
                  ]),
                ]),
                'text/csv',
              )
            }
          >
            <Download className="w-4 h-4" />
            Export
          </button>
          {role === 'admin' && (
            <button className={primaryClass} onClick={() => open('new')}>
              <Plus className="w-4 h-4" />
              Add user
            </button>
          )}
        </div>
      </Heading>
      <div className="flex gap-3 mb-5">
        <SearchField
          value={search}
          onChange={setSearch}
          placeholder="Search people by name or email"
        />
        {role === 'admin' && (
          <select
            aria-label="Filter users"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className={`${inputClass} !w-auto`}
          >
            {['All', 'admin', 'tutor', 'learner', 'Inactive'].map((f) => (
              <option key={f}>{f}</option>
            ))}
          </select>
        )}
      </div>
      {!users.length ? (
        <Empty />
      ) : (
        <Panel>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="text-xs uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="pb-4">Person</th>
                  <th>Role</th>
                  <th>{role === 'tutor' ? 'Learning progress' : 'Status'}</th>
                  <th className="text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => {
                  const enrs = enrollments.filter((e) => e.learnerId === u.id)
                  const progress = enrs.length
                    ? Math.round(enrs.reduce((a, e) => a + e.progress, 0) / enrs.length)
                    : 0
                  return (
                    <tr key={u.id} className="border-t border-slate-100">
                      <td className="py-4 pr-5">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-brand-50 text-brand-600 flex items-center justify-center font-semibold shrink-0">
                            {u.name
                              .split(' ')
                              .map((n) => n[0])
                              .slice(0, 2)
                              .join('')}
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">{u.name}</p>
                            <p className="text-xs text-slate-400">{u.email}</p>
                          </div>
                        </div>
                      </td>
                      <td className="pr-5">
                        <Badge
                          variant={
                            u.role === 'admin' ? 'danger' : u.role === 'tutor' ? 'warning' : 'info'
                          }
                        >
                          {u.role}
                        </Badge>
                      </td>
                      <td className="pr-5">
                        {role === 'tutor' ? (
                          <div className="min-w-28">
                            <ProgressBar value={progress} />
                            <p className="text-xs text-slate-400 mt-1">
                              {progress}% · {enrs.length} courses
                            </p>
                          </div>
                        ) : (
                          <Badge variant={u.isActive ? 'success' : 'default'}>
                            {u.isActive ? 'Active' : 'Inactive'}
                          </Badge>
                        )}
                      </td>
                      <td className="text-right">
                        {role === 'admin' ? (
                          <div className="flex justify-end gap-3">
                            <button className="font-medium text-brand-600" onClick={() => open(u)}>
                              Edit
                            </button>
                            <button
                              disabled={u.id === currentUser.id}
                              className="text-xs text-slate-500 disabled:opacity-30"
                              onClick={async () => {
                                if (
                                  !(await mutate({
                                    type: 'profile',
                                    user: { ...u, isActive: !u.isActive },
                                  }))
                                )
                                  return
                                notice(`${u.name} ${u.isActive ? 'deactivated' : 'activated'}.`)
                              }}
                            >
                              {u.isActive ? 'Deactivate' : 'Activate'}
                            </button>
                          </div>
                        ) : (
                          <Link
                            className="text-brand-600 font-medium"
                            href={`/tutor/students/${u.id}`}
                          >
                            View progress
                          </Link>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </Panel>
      )}
      {editing && (
        <Modal
          title={editing === 'new' ? 'Add a community member' : 'Edit account'}
          onClose={() => {
            if (!saving) setEditing(null)
          }}
        >
          {activationLink ? (
            <div className="space-y-5">
              <p role="status" className="rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800">
                {name} has been added as a {userRole}.
              </p>
              <p className="text-sm text-slate-600">
                Share this one-time setup link privately with {email}. They will confirm their
                account and choose their own password. No email has been sent.
              </p>
              <Field label="Account setup link">
                <input
                  readOnly
                  aria-label="Account setup link"
                  value={activationLink}
                  className={inputClass}
                  onFocus={(e) => e.target.select()}
                />
              </Field>
              {formError && (
                <p role="alert" className="text-sm text-rose-600">
                  {formError}
                </p>
              )}
              <div className="flex justify-end gap-3">
                <button
                  type="button"
                  className={secondaryClass}
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(activationLink)
                      setCopied(true)
                    } catch {
                      setFormError('Select the setup link above and copy it manually.')
                    }
                  }}
                >
                  {copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied' : 'Copy setup link'}
                </button>
                <button
                  type="button"
                  className={primaryClass}
                  onClick={() => {
                    setActivationLink('')
                    setEditing(null)
                  }}
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            <form
              className="space-y-4"
              onSubmit={async (e) => {
                e.preventDefault()
                if (saving) return
                setFormError('')
                if (!name.trim()) {
                  setFormError('Enter a full name.')
                  return
                }
                const normalized = email.trim().toLowerCase()
                if (
                  state.users.some(
                    (u) =>
                      u.email.toLowerCase() === normalized &&
                      (editing === 'new' || u.id !== editing.id),
                  )
                ) {
                  setFormError('An account with that email already exists.')
                  return
                }
                const user: User = {
                  id: editing === 'new' ? crypto.randomUUID() : editing.id,
                  name: name.trim(),
                  email: normalized,
                  role: userRole,
                  avatar:
                    editing === 'new'
                      ? 'https://api.dicebear.com/7.x/initials/svg?seed=User'
                      : editing.avatar,
                  isActive: editing === 'new' ? true : editing.isActive,
                  joinedAt: editing === 'new' ? new Date().toISOString() : editing.joinedAt,
                }
                setSaving(true)
                try {
                  if (editing === 'new') {
                    if (userRole === 'admin') throw new Error('Choose a learner or tutor role.')
                    const result = (await execute({
                      type: 'invite',
                      name: user.name,
                      email: user.email,
                      role: userRole,
                    })) as { activationLink: string }
                    setActivationLink(result.activationLink)
                  } else {
                    await execute({ type: 'profile', user })
                    notice('Account saved.')
                    setEditing(null)
                  }
                } catch (e) {
                  setFormError(e instanceof Error ? e.message : 'Unable to save this account.')
                } finally {
                  setSaving(false)
                }
              }}
            >
              {editing === 'new' && (
                <p className="text-sm text-slate-500">
                  Add a learner or tutor. After creation, copy the secure setup link and share it
                  with them.
                </p>
              )}
              {formError && (
                <p role="alert" className="rounded-xl bg-rose-50 p-3 text-sm text-rose-700">
                  {formError}
                </p>
              )}
              <fieldset disabled={saving} className="space-y-4">
                <Field label="Full name">
                  <input
                    className={inputClass}
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </Field>
                <Field label="Email">
                  <input
                    className={inputClass}
                    required
                    type="email"
                    value={email}
                    readOnly={editing !== 'new'}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </Field>
                <Field label="Role">
                  <select
                    className={inputClass}
                    disabled={editing !== 'new' && editing.id === currentUser.id}
                    value={userRole}
                    onChange={(e) => setUserRole(e.target.value as Role)}
                  >
                    {(editing !== 'new' && editing.role === 'admin'
                      ? ['learner', 'tutor', 'admin']
                      : ['learner', 'tutor']
                    ).map((r) => (
                      <option key={r}>{r}</option>
                    ))}
                  </select>
                </Field>
              </fieldset>
              <div className="flex justify-end gap-3 pt-3">
                <button
                  type="button"
                  disabled={saving}
                  className={secondaryClass}
                  onClick={() => setEditing(null)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className={`${primaryClass} disabled:opacity-50`}
                >
                  {saving ? 'Saving…' : editing === 'new' ? 'Create account' : 'Save account'}
                </button>
              </div>
            </form>
          )}
        </Modal>
      )}
    </FeatureShell>
  )
}
export function StudentDetail({ id }: { id: string }) {
  const { state, user: currentUser } = useLms()
  const user = state.users.find((u) => u.id === id)
  const courses = state.courses.filter((c) => c.tutorId === currentUser.id)
  const enrollments = state.enrollments.filter(
    (e) => e.learnerId === id && courses.some((c) => c.id === e.courseId),
  )
  return (
    <FeatureShell role="tutor" title="Student progress">
      {!user || !enrollments.length ? (
        <Empty title="Learner unavailable" href="/tutor/students" action="Back to students" />
      ) : (
        <>
          <Link className="text-brand-600 text-sm" href="/tutor/students">
            ← All students
          </Link>
          <Heading title={user.name} description={user.email} />
          {enrollments.map((e) => (
            <Panel key={e.id} className="mb-4">
              <h3 className="font-semibold mb-4">
                {courses.find((c) => c.id === e.courseId)?.title}
              </h3>
              <ProgressBar value={e.progress} />
              <p className="text-sm text-slate-500 mt-3">
                {e.progress}% complete · Last activity{' '}
                {new Date(e.lastAccessedAt).toLocaleDateString()}
              </p>
              <div className="mt-4">
                {state.attempts
                  .filter(
                    (a) =>
                      a.learnerId === id &&
                      state.quizzes.some((q) => q.id === a.quizId && q.courseId === e.courseId),
                  )
                  .map((a) => (
                    <p key={a.id} className="text-sm text-slate-500">
                      Assessment: {a.score}% · {a.passed ? 'Passed' : 'Needs practice'}
                    </p>
                  ))}
              </div>
            </Panel>
          ))}
        </>
      )}
    </FeatureShell>
  )
}
