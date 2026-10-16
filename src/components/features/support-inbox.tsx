'use client'
import { useEffect, useState } from 'react'
import { useLms } from '@/lib/lms/store'
import type { Database } from '@/types/database.types'
import { Panel, secondaryClass } from './common'
type Ticket = Database['public']['Tables']['support_tickets']['Row']
export function SupportInbox() {
  const { mutate, notice } = useLms()
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [page, setPage] = useState(0)
  const [more, setMore] = useState(false)
  async function load() {
    const response = await fetch(`/api/support?page=${page}`, { cache: 'no-store' })
    const body = await response.json()
    if (!response.ok) throw new Error(body.error)
    setTickets(body.tickets)
    setMore(body.hasMore)
  }
  useEffect(() => {
    load().catch((e) => notice(e.message))
  }, [page]) // eslint-disable-line react-hooks/exhaustive-deps
  return (
    <Panel className="mt-6">
      <h3 className="font-semibold mb-4">Support inbox</h3>
      {tickets.length ? (
        tickets.map((t) => (
          <article className="border-t py-4 space-y-2" key={t.id}>
            <div className="flex justify-between gap-4">
              <h4 className="font-medium">{t.subject}</h4>
              <span className="text-xs text-slate-500">{t.status}</span>
            </div>
            <p className="text-sm text-slate-600 whitespace-pre-wrap">{t.message}</p>
            <p className="text-xs text-slate-400">
              {new Date(t.created_at).toLocaleString()} · Account {t.user_id}
            </p>
            <button
              className={secondaryClass}
              onClick={async () => {
                if (
                  await mutate({
                    type: 'supportStatus',
                    id: t.id,
                    status: t.status === 'open' ? 'closed' : 'open',
                  })
                )
                  await load()
              }}
            >
              {t.status === 'open' ? 'Close request' : 'Reopen request'}
            </button>
          </article>
        ))
      ) : (
        <p className="text-sm text-slate-500">No support requests on this page.</p>
      )}
      <div className="flex gap-3 mt-4">
        <button className={secondaryClass} disabled={!page} onClick={() => setPage(page - 1)}>
          Previous
        </button>
        <button className={secondaryClass} disabled={!more} onClick={() => setPage(page + 1)}>
          Next
        </button>
      </div>
    </Panel>
  )
}
