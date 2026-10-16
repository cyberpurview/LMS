'use client'
import React from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useLms } from '@/lib/lms/store'
import { cn } from '@/lib/utils'
import {
  LayoutDashboard,
  BookOpen,
  Users,
  BarChart3,
  Settings,
  Award,
  GraduationCap,
  PlusCircle,
  FileText,
  TrendingUp,
  ShieldCheck,
  HelpCircle,
  ChevronLeft,
  X,
} from 'lucide-react'
import type { Role } from '@/types'
import { BrandLogo } from './BrandLogo'
interface NavItem {
  label: string
  href: string
  icon: React.ComponentType<{
    className?: string
  }>
  badge?: number
}
interface SidebarSection {
  title?: string
  items: NavItem[]
}
const adminNav: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/admin', icon: LayoutDashboard },
      { label: 'Analytics', href: '/admin/analytics', icon: BarChart3 },
    ],
  },
  {
    title: 'Management',
    items: [
      { label: 'Users', href: '/admin/users', icon: Users },
      { label: 'Courses', href: '/admin/courses', icon: BookOpen },
      { label: 'Certificates', href: '/admin/certificates', icon: Award },
      { label: 'Quizzes', href: '/admin/quizzes', icon: FileText },
    ],
  },
  {
    title: 'System',
    items: [
      { label: 'Settings', href: '/admin/settings', icon: Settings },
      { label: 'Help center', href: '/admin/help', icon: HelpCircle },
    ],
  },
]
const tutorNav: SidebarSection[] = [
  {
    items: [
      { label: 'Dashboard', href: '/tutor', icon: LayoutDashboard },
      { label: 'Analytics', href: '/tutor/analytics', icon: TrendingUp },
    ],
  },
  {
    title: 'Content',
    items: [
      { label: 'My Courses', href: '/tutor/courses', icon: BookOpen },
      { label: 'Create Course', href: '/tutor/courses/new', icon: PlusCircle },
      { label: 'Quizzes', href: '/tutor/quizzes', icon: FileText },
    ],
  },
  {
    title: 'Students',
    items: [
      { label: 'Students', href: '/tutor/students', icon: Users },
      { label: 'Settings', href: '/tutor/settings', icon: Settings },
      { label: 'Help center', href: '/tutor/help', icon: HelpCircle },
    ],
  },
]
const learnerNav: SidebarSection[] = [
  {
    items: [{ label: 'Dashboard', href: '/learner', icon: LayoutDashboard }],
  },
  {
    title: 'Learning',
    items: [
      { label: 'My Courses', href: '/learner/courses', icon: BookOpen },
      { label: 'Browse Catalog', href: '/learner/catalog', icon: GraduationCap },
      { label: 'Certificates', href: '/learner/certificates', icon: Award },
      { label: 'Quizzes', href: '/learner/quizzes', icon: FileText },
    ],
  },
  {
    title: 'Account',
    items: [
      { label: 'Settings', href: '/learner/settings', icon: Settings },
      { label: 'Help', href: '/learner/help', icon: HelpCircle },
    ],
  },
]
const navConfig: Record<Role, SidebarSection[]> = {
  admin: adminNav,
  tutor: tutorNav,
  learner: learnerNav,
}
const roleMeta: Record<
  Role,
  {
    label: string
    color: string
    icon: React.ComponentType<{
      className?: string
    }>
  }
> = {
  admin: { label: 'Admin Portal', color: 'text-rose-500', icon: ShieldCheck },
  tutor: { label: 'Tutor Studio', color: 'text-amber-500', icon: GraduationCap },
  learner: { label: 'My Learning', color: 'text-brand-500', icon: BookOpen },
}
interface SidebarProps {
  role: Role
  /** Desktop: sidebar is icon-only when true */
  collapsed?: boolean
  onToggle?: () => void
  /** Mobile: sidebar drawer is open */
  mobileOpen?: boolean
  onMobileClose?: () => void
}
export function Sidebar({
  role,
  collapsed = false,
  onToggle,
  mobileOpen = false,
  onMobileClose,
}: SidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { prefetchSection } = useLms()
  const hoverTimer = React.useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancelPrefetch = () => clearTimeout(hoverTimer.current)
  const prepare = (path: string) => {
    cancelPrefetch()
    hoverTimer.current = setTimeout(() => {
      if (prefetchSection(path)) router.prefetch(path)
    }, 180)
  }
  React.useEffect(() => {
    cancelPrefetch()
    return cancelPrefetch
  }, [pathname])
  const sections = navConfig[role]
  const meta = roleMeta[role]
  // Close mobile drawer on route change
  React.useEffect(() => {
    onMobileClose?.()
  }, [pathname]) // eslint-disable-line react-hooks/exhaustive-deps
  const navContent = (isMobile: boolean) => (
    <>
      {/* Logo */}
      <div
        className={cn(
          'flex items-center h-20 border-b border-slate-100 shrink-0',
          !isMobile && collapsed ? 'px-1 gap-0' : 'px-4 gap-3',
        )}
      >
        <Link href={`/${role}`} aria-label="CyberPurview dashboard" className="shrink-0">
          <BrandLogo
            iconOnly={!isMobile && collapsed}
            className={!isMobile && collapsed ? 'h-7 w-7' : 'h-12'}
          />
        </Link>
        {(isMobile || !collapsed) && (
          <p className={cn('text-[10px] font-medium leading-tight', meta.color)}>{meta.label}</p>
        )}
        {/* Mobile: close button; Desktop: collapse toggle */}
        {isMobile ? (
          <button
            onClick={onMobileClose}
            aria-label="Close navigation"
            className="ml-auto p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        ) : (
          <button
            onClick={onToggle}
            aria-label={collapsed ? 'Expand navigation' : 'Collapse navigation'}
            className="ml-auto p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors"
          >
            <ChevronLeft
              className={cn('w-4 h-4 transition-transform', collapsed && 'rotate-180')}
            />
          </button>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-4 px-2 space-y-6">
        {sections.map((section, si) => (
          <div key={si}>
            {section.title && (isMobile || !collapsed) && (
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-3 mb-2">
                {section.title}
              </p>
            )}
            <ul className="space-y-1">
              {section.items.map((item) => {
                const ItemIcon = item.icon
                const isActive =
                  pathname === item.href ||
                  (item.href !== `/${role}` &&
                    pathname.startsWith(item.href + '/') &&
                    !sections
                      .flatMap((s) => s.items)
                      .some(
                        (n) =>
                          n.href !== item.href &&
                          n.href.startsWith(item.href + '/') &&
                          pathname.startsWith(n.href),
                      ))
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      prefetch={false}
                      onMouseEnter={() => prepare(item.href)}
                      onMouseLeave={cancelPrefetch}
                      onFocus={() => prepare(item.href)}
                      onBlur={cancelPrefetch}
                      aria-current={isActive ? 'page' : undefined}
                      className={cn(
                        'flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-all group',
                        isActive
                          ? 'bg-brand-50 text-brand-700'
                          : 'text-slate-600 hover:bg-slate-50 hover:text-navy',
                        !isMobile && collapsed && 'justify-center px-2',
                      )}
                      title={!isMobile && collapsed ? item.label : undefined}
                    >
                      <ItemIcon
                        className={cn(
                          'w-5 h-5 shrink-0 transition-colors',
                          isActive ? 'text-brand-600' : 'text-slate-400 group-hover:text-slate-600',
                        )}
                      />
                      {(isMobile || !collapsed) && <span className="truncate">{item.label}</span>}
                      {(isMobile || !collapsed) && item.badge !== undefined && (
                        <span className="ml-auto bg-brand-500 text-white text-xs font-bold rounded-full w-5 h-5 flex items-center justify-center shrink-0">
                          {item.badge}
                        </span>
                      )}
                    </Link>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </nav>
    </>
  )
  return (
    <>
      {/* ── Mobile drawer backdrop ─────────────────────────────────── */}
      {mobileOpen && (
        <div
          className="fixed inset-0 bg-black/40 backdrop-blur-sm z-40 lg:hidden"
          onClick={onMobileClose}
          aria-hidden="true"
        />
      )}

      {/* ── Mobile slide-in drawer ─────────────────────────────────── */}
      <aside
        className={cn(
          'fixed top-0 left-0 h-full bg-white flex flex-col z-50 shadow-2xl transition-transform duration-300 w-72',
          'lg:hidden',
          mobileOpen ? 'translate-x-0 visible' : '-translate-x-full invisible',
        )}
      >
        {navContent(true)}
      </aside>

      {/* ── Desktop fixed sidebar ──────────────────────────────────── */}
      <aside
        className={cn(
          'hidden lg:flex fixed top-0 left-0 h-full bg-white border-r border-slate-100 flex-col z-40 transition-all duration-300 shadow-sm',
          collapsed ? 'w-16' : 'w-[260px]',
        )}
      >
        {navContent(false)}
      </aside>
    </>
  )
}
