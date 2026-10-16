'use client'
import { useRef, useState } from 'react'
import { useLms } from '@/lib/lms/store'
import { Panel, inputClass, secondaryClass, Field } from './common'
export function QuizAttemptAccess({ quizId }: { quizId: string }) {
  const { execute } = useLms()
  const grantRequest = useRef<{ key: string; id: string } | null>(null)
  const [hasMore, setHasMore] = useState(false)
  const [rows, setRows] = useState<
    { id: string; name: string; attemptsUsed: number; attemptsRemaining: number }[]
  >([])
  const [selected, setSelected] = useState(''),
    [reason, setReason] = useState(''),
    [extra, setExtra] = useState(1)
  const [busy, setBusy] = useState(false),
    [message, setMessage] = useState(''),
    [opened, setOpened] = useState(false)
  async function load(afterId?: string) {
    setBusy(true)
    setMessage('')
    try {
      const incoming = (await execute({
        type: 'quizAttempts',
        action: 'list',
        quizId,
        afterId,
      })) as typeof rows
      setRows((current) => (afterId ? [...current, ...incoming] : incoming))
      setHasMore(incoming.length === 100)
      setOpened(true)
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'Unable to load attempts.')
    } finally {
      setBusy(false)
    }
  }
  return (
    <Panel className="mt-6">
      <div className="flex flex-wrap justify-between gap-3">
        <h3 className="font-semibold">Additional attempts</h3>
        <button className={secondaryClass} disabled={busy} onClick={() => void load()}>
          {opened ? 'Refresh learners' : 'Manage attempts'}
        </button>
      </div>
      {opened && (
        <form
          className="mt-5 grid gap-4 sm:grid-cols-2"
          onSubmit={async (e) => {
            e.preventDefault()
            setBusy(true)
            setMessage('')
            try {
              const key = JSON.stringify([selected, extra, reason])
              if (grantRequest.current?.key !== key)
                grantRequest.current = { key, id: crypto.randomUUID() }
              await execute({
                type: 'quizAttempts',
                requestId: grantRequest.current.id,
                action: 'grant',
                quizId,
                learnerId: selected,
                extra,
                reason,
              })
              grantRequest.current = null
              await load()
              setReason('')
              setSelected('')
              setMessage('Additional attempts granted.')
            } catch (error) {
              setMessage(error instanceof Error ? error.message : 'Unable to grant attempts.')
            } finally {
              setBusy(false)
            }
          }}
        >
          <Field label="Learner">
            <select
              className={inputClass}
              required
              value={selected}
              disabled={busy}
              onChange={(e) => setSelected(e.target.value)}
            >
              <option value="">Select a learner</option>
              {rows.map((row) => (
                <option value={row.id} key={row.id}>
                  {row.name} · {row.attemptsRemaining} remaining
                </option>
              ))}
            </select>
          </Field>
          <Field label="Extra attempts">
            <input
              className={inputClass}
              type="number"
              min={1}
              max={10}
              required
              value={extra}
              disabled={busy}
              onChange={(e) => setExtra(Number(e.target.value))}
            />
          </Field>
          <Field label="Reason" className="sm:col-span-2">
            <input
              className={inputClass}
              required
              minLength={5}
              maxLength={500}
              value={reason}
              disabled={busy}
              onChange={(e) => setReason(e.target.value)}
            />
          </Field>
          <button className={secondaryClass} disabled={busy || !selected} type="submit">
            Grant attempts
          </button>
          {!rows.length && (
            <p className="text-sm text-slate-500">No learners have started this quiz.</p>
          )}
        </form>
      )}
      {hasMore && (
        <button
          type="button"
          className={secondaryClass + ' mt-4'}
          disabled={busy}
          onClick={() => void load(rows.at(-1)?.id)}
        >
          Load more learners
        </button>
      )}
      {message && (
        <p role="status" className="mt-3 text-sm text-slate-600">
          {message}
        </p>
      )}
    </Panel>
  )
}
