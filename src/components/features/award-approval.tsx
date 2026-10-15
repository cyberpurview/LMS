'use client'
import { useEffect, useState } from 'react'
import { useLms } from '@/lib/lms/store'
import { Panel, secondaryClass } from './common'
export function AwardApproval({ kind, subjectId }: { kind: 'course' | 'quiz'; subjectId: string }) {
  const { execute } = useLms()
  const [rows, setRows] = useState<{ id: string; name: string; issued: boolean }[]>([]),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('')
  async function load() {
    setLoading(true)
    setError('')
    try {
      setRows(
        (await execute({ type: 'award', action: 'candidates', kind, subjectId })) as typeof rows,
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load approvals')
    } finally {
      setLoading(false)
    }
  }
  useEffect(() => {
    void load()
  }, [subjectId]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Panel className="mt-6">
      <h3 className="font-semibold mb-2">Certificate approvals</h3>
      <p className="text-sm text-slate-500 mb-4">Eligible learners awaiting approval.</p>
      {loading && <p role="status">Loading…</p>}
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      {!loading && !rows.length && (
        <p className="text-sm text-slate-500">No eligible learners yet.</p>
      )}
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-center justify-between gap-3 py-3 border-t border-slate-100"
        >
          <span>{row.name}</span>
          {row.issued ? (
            <span className="text-sm text-emerald-600">Issued</span>
          ) : (
            <button
              disabled={loading}
              className={secondaryClass}
              onClick={async () => {
                setLoading(true)
                try {
                  await execute({
                    type: 'award',
                    action: 'approve',
                    kind,
                    subjectId,
                    learnerId: row.id,
                  })
                  await load()
                } catch (e) {
                  setError(e instanceof Error ? e.message : 'Approval failed')
                  setLoading(false)
                }
              }}
            >
              Approve certificate
            </button>
          )}
        </div>
      ))}
      <button className={`${secondaryClass} mt-3`} disabled={loading} onClick={() => void load()}>
        Refresh
      </button>
    </Panel>
  )
}
