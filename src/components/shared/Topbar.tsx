'use client'
import React, { useState } from 'react'
import Link from 'next/link'
import { useRouter, usePathname } from 'next/navigation'
import { Bell, Search, ChevronDown, LogOut, Settings, Menu } from 'lucide-react'
import { useLms } from '@/lib/lms/store'
import { createClient } from '@/lib/supabase/client'
import type { Role } from '@/types'
import { ThemeSelector } from './DashboardThemeProvider'
interface TopbarProps {
  role: Role
  userName: string
  userAvatar: string
  title: string
  onMenuClick?: () => void
  collapsed?: boolean
}
export function Topbar({ role, userName, title, onMenuClick, collapsed }: TopbarProps) {
  const { state, user: currentUser, notice } = useLms()
  const router = useRouter()
  const pathname = usePathname()
  const hasCourseSearch = /^\/(?:learner\/catalog|(?:admin|tutor|learner)\/courses)\/?$/.test(
    pathname,
  )
  const isEditor =
    /\/(?:courses|quizzes)\/(?:new|[^/]+\/edit)\/?$/.test(pathname) ||
    pathname.endsWith('/settings')
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const ref = React.useRef<HTMLDivElement>(null)
  const user = state.users.find((u) => u.id === currentUser.id)
  const name = user?.name || userName
  const count = state.unreadNotifications
  React.useEffect(() => {
    function close(e: MouseEvent) {
      if (!ref.current?.contains(e.target as Node)) setOpen(false)
    }
    function escape(e: KeyboardEvent) {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', escape)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', escape)
    }
  }, [])
  return (
    <header
      className={`fixed top-0 right-0 left-0 ${collapsed ? 'lg:left-16' : 'lg:left-[260px]'} h-16 bg-white/95 backdrop-blur border-b border-slate-200/70 flex items-center px-4 sm:px-6 gap-3 z-30 transition-all`}
    >
      <button
        aria-label="Open navigation"
        onClick={onMenuClick}
        className="lg:hidden p-2 text-slate-500"
      >
        <Menu className="w-5 h-5" />
      </button>
      <h1 className="font-semibold text-slate-800 text-sm sm:text-base flex-1 truncate">{title}</h1>
      {!hasCourseSearch && !isEditor && (
        <form
          className="hidden md:flex items-center gap-2 rounded-xl bg-slate-50 border border-slate-200 px-3 py-2"
          onSubmit={(e) => {
            e.preventDefault()
            router.push(
              `/${role}/${role === 'learner' ? 'catalog' : 'courses'}?q=${encodeURIComponent(query)}`,
            )
          }}
        >
          <Search className="w-4 h-4 text-slate-400" />
          <input
            aria-label="Search courses"
            className="bg-transparent outline-none text-sm w-32 xl:w-48"
            placeholder="Search courses..."
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </form>
      )}
      <Link
        aria-label={`Notifications, ${count} unread`}
        className="relative p-2 text-slate-500 hover:bg-slate-50 rounded-xl"
        href={`/${role}/notifications`}
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span className="absolute top-1 right-1 h-2 w-2 bg-brand-500 rounded-full ring-2 ring-white" />
        )}
      </Link>
      <div ref={ref} className="relative">
        <button
          aria-label="Account menu"
          aria-expanded={open}
          className="flex items-center gap-2"
          onClick={() => setOpen(!open)}
        >
          <span className="w-9 h-9 rounded-xl bg-brand-50 text-brand-600 flex items-center justify-center text-xs font-bold">
            {name
              .split(' ')
              .map((s) => s[0])
              .slice(0, 2)
              .join('')}
          </span>
          <ChevronDown className="w-3 h-3 text-slate-400" />
        </button>
        {open && (
          <div className="absolute right-0 top-full mt-4 bg-white rounded-xl shadow-xl border border-slate-200 p-2 w-56">
            <div className="p-3 border-b border-slate-100 mb-2">
              <p className="text-sm font-semibold">{name}</p>
              <p className="text-xs text-slate-400 capitalize mt-1">{role} account</p>
            </div>
            <Link
              onClick={() => setOpen(false)}
              href={`/${role}/settings`}
              className="flex items-center gap-3 p-3 text-sm text-slate-600 hover:bg-slate-50 rounded-lg"
            >
              <Settings className="w-4 h-4" />
              Profile & settings
            </Link>
            <ThemeSelector />
            <button
              onClick={async () => {
                const { error } = await createClient().auth.signOut()
                if (!error) window.location.assign('/login')
                else notice(error.message)
              }}
              className="flex items-center gap-3 p-3 text-sm text-rose-600 hover:bg-rose-50 rounded-lg"
            >
              <LogOut className="w-4 h-4" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </header>
  )
}
