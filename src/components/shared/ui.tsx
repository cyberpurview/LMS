'use client'

import React from 'react'
import { cn } from '@/lib/utils'
import { TrendingUp, TrendingDown } from 'lucide-react'
import Image from 'next/image'
import { CourseArtwork } from './CourseArtwork'

interface StatCardProps {
  title: string
  value: string | number
  subtitle?: string
  trend?: {
    value: number
    label: string
  }
  className?: string
}

export function StatCard({ title, value, subtitle, trend, className }: StatCardProps) {
  const isPositive = trend && trend.value >= 0

  return (
    <div className={cn('bg-white rounded-2xl p-6 border border-slate-100', className)}>
      <div className="flex items-start justify-between mb-4">
        <p className="text-sm font-medium text-slate-600">{title}</p>
        {trend && (
          <div
            className={cn(
              'flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full',
              isPositive ? 'text-emerald-700 bg-emerald-50' : 'text-rose-700 bg-rose-50',
            )}
          >
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {isPositive ? '+' : ''}
            {trend.value}%
          </div>
        )}
      </div>
      <p className="text-3xl font-bold text-navy leading-none mb-1">{value}</p>
      {subtitle && <p className="text-xs text-slate-400 mt-1">{subtitle}</p>}
      {trend && <p className="text-xs text-slate-400 mt-2">{trend.label}</p>}
    </div>
  )
}

// ─── Course Card ──────────────────────────────────────────────────────────────

interface CourseCardProps {
  title: string
  instructor: string
  instructorAvatar: string
  thumbnail: string
  category: string
  level: string
  duration: number
  enrolledCount: number
  rating: number
  price: number
  progress?: number
  status?: string
  onClick?: () => void
}

export function CourseCard({
  title,
  instructor,
  instructorAvatar,
  thumbnail,
  category,
  level,
  duration,
  enrolledCount,
  rating,
  price,
  progress,
  status,
  onClick,
}: CourseCardProps) {
  const levelColor: Record<string, string> = {
    Beginner: 'bg-emerald-50 text-emerald-700',
    Intermediate: 'bg-amber-50 text-amber-700',
    Advanced: 'bg-rose-50 text-rose-700',
  }

  return (
    <div
      onClick={onClick}
      role={onClick ? 'button' : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={(e) => {
        if (onClick && (e.key === 'Enter' || e.key === ' ')) {
          e.preventDefault()
          onClick()
        }
      }}
      className="bg-white rounded-2xl border border-slate-100 overflow-hidden hover:shadow-lg transition-all duration-200 cursor-pointer group"
    >
      {/* Thumbnail */}
      <div className="relative aspect-video overflow-hidden bg-slate-100">
        {thumbnail ? (
          <Image
            src={thumbnail}
            alt={title}
            fill
            sizes="(max-width: 768px) 100vw, 400px"
            className="object-cover"
          />
        ) : (
          <CourseArtwork category={category} title={title} />
        )}
        {status && status !== 'published' && (
          <div className="absolute top-3 left-3">
            <span className="bg-slate-800/80 text-white text-xs font-semibold px-2.5 py-1 rounded-full capitalize">
              {status}
            </span>
          </div>
        )}
        <div className="absolute top-3 right-3">
          <span
            className={cn(
              'text-xs font-semibold px-2.5 py-1 rounded-full',
              levelColor[level] || 'bg-slate-100 text-slate-600',
            )}
          >
            {level}
          </span>
        </div>
      </div>

      <div className="p-5">
        {/* Category */}
        <p className="text-xs font-semibold text-brand-600 mb-2 uppercase tracking-wide">
          {category}
        </p>

        {/* Title */}
        <h3 className="font-semibold text-navy text-sm leading-snug mb-3 line-clamp-2 group-hover:text-brand-700 transition-colors">
          {title}
        </h3>

        {/* Instructor */}
        <div className="flex items-center gap-2 mb-4">
          <span
            aria-hidden="true"
            className="w-6 h-6 rounded-full bg-slate-100 text-slate-500 text-[9px] font-semibold flex items-center justify-center shrink-0"
          >
            {instructor
              .replace('Dr. ', '')
              .split(' ')
              .map((n) => n[0])
              .slice(0, 2)
              .join('')}
          </span>
          <span className="text-xs text-slate-500 truncate">{instructor}</span>
        </div>

        {/* Progress bar (for enrolled courses) */}
        {progress !== undefined && (
          <div className="mb-4">
            <div className="flex items-center justify-between mb-1.5">
              <span className="text-xs text-slate-500">Progress</span>
              <span className="text-xs font-semibold text-slate-700">{progress}%</span>
            </div>
            <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-brand-500 to-brand-700 rounded-full transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        )}

        {/* Meta */}
        <div className="flex items-center justify-between text-xs text-slate-500">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span>{rating > 0 ? `${rating.toFixed(1)} rating` : 'New'}</span>
            <span>
              {duration} {duration === 1 ? 'hour' : 'hours'}
            </span>
            <span>
              {enrolledCount.toLocaleString()} {enrolledCount === 1 ? 'learner' : 'learners'}
            </span>
          </div>
          {progress === undefined && (
            <span className="font-bold text-navy text-sm">${price.toFixed(2)}</span>
          )}
        </div>
      </div>
    </div>
  )
}

// ─── Badge ────────────────────────────────────────────────────────────────────

interface BadgeProps {
  children: React.ReactNode
  variant?: 'default' | 'success' | 'warning' | 'danger' | 'info'
  className?: string
}

const badgeVariants: Record<string, string> = {
  default: 'bg-slate-100 text-slate-700',
  success: 'bg-emerald-50 text-emerald-700',
  warning: 'bg-amber-50 text-amber-700',
  danger: 'bg-rose-50 text-rose-700',
  info: 'bg-brand-50 text-brand-700',
}

export function Badge({ children, variant = 'default', className }: BadgeProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-semibold',
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

// ─── Progress Bar ─────────────────────────────────────────────────────────────

interface ProgressBarProps {
  value: number
  max?: number
  className?: string
  showLabel?: boolean
  color?: string
}

export function ProgressBar({
  value,
  max = 100,
  className,
  showLabel = false,
  color = 'bg-brand-500',
}: ProgressBarProps) {
  const pct = Math.min(100, Math.round((value / max) * 100))
  return (
    <div className={cn('w-full', className)}>
      {showLabel && (
        <div className="flex justify-between text-xs text-slate-500 mb-1">
          <span>{pct}%</span>
          <span>
            {value}/{max}
          </span>
        </div>
      )}
      <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all duration-500', color)}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  )
}

// ─── Avatar ───────────────────────────────────────────────────────────────────

interface AvatarProps {
  src: string
  alt: string
  size?: 'sm' | 'md' | 'lg' | 'xl'
  className?: string
}

const avatarSizes: Record<string, string> = {
  sm: 'w-8 h-8',
  md: 'w-10 h-10',
  lg: 'w-12 h-12',
  xl: 'w-16 h-16',
}

export function Avatar({ src, alt, size = 'md', className }: AvatarProps) {
  return (
    <Image
      width={64}
      height={64}
      unoptimized
      src={src}
      alt={alt}
      className={cn(
        'rounded-full bg-slate-200 object-cover shrink-0',
        avatarSizes[size],
        className,
      )}
    />
  )
}

// ─── Empty State ──────────────────────────────────────────────────────────────

interface EmptyStateProps {
  title: string
  description: string
  action?: React.ReactNode
}

export function EmptyState({ title, description, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <h3 className="text-lg font-semibold text-slate-700 mb-2">{title}</h3>
      <p className="text-sm text-slate-500 max-w-sm mb-6">{description}</p>
      {action}
    </div>
  )
}
