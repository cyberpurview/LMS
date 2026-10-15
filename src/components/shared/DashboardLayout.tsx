'use client'

import React from 'react'
import { Sidebar } from '@/components/shared/Sidebar'
import { Topbar } from '@/components/shared/Topbar'
import { cn } from '@/lib/utils'
import type { Role } from '@/types'

interface DashboardLayoutProps {
  role: Role
  userName: string
  userAvatar: string
  pageTitle: string
  children: React.ReactNode
}

export function DashboardLayout({
  role,
  userName,
  userAvatar,
  pageTitle,
  children,
}: DashboardLayoutProps) {
  const [collapsed, setCollapsed] = React.useState(false)
  const [mobileOpen, setMobileOpen] = React.useState(false)

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar
        role={role}
        collapsed={collapsed}
        onToggle={() => setCollapsed(!collapsed)}
        mobileOpen={mobileOpen}
        onMobileClose={() => setMobileOpen(false)}
      />
      <Topbar
        role={role}
        userName={userName}
        userAvatar={userAvatar}
        title={pageTitle}
        onMenuClick={() => setMobileOpen(true)}
        collapsed={collapsed}
      />

      <main
        className={cn(
          'transition-all duration-300 pt-20 min-h-screen flex flex-col',
          // On mobile, zero margin because sidebar is a hidden drawer overlay
          'ml-0',
          // On desktop (lg+), apply left margin according to collapse state
          collapsed ? 'lg:ml-16' : 'lg:ml-[260px]',
        )}
      >
        <div className="p-4 sm:p-6 lg:p-8 2xl:px-10 animate-fade-in w-full max-w-[1600px] mx-auto flex-1 min-w-0">
          {children}
        </div>
      </main>
    </div>
  )
}
