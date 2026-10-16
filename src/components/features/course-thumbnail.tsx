'use client'
import { useState } from 'react'
import Image from 'next/image'
import { THUMBNAIL_MAX_BYTES, THUMBNAIL_TYPES } from '@/lib/lms/thumbnail'
import { secondaryClass } from './common'

export function CourseThumbnail({
  courseId,
  value,
  onChange,
  onBusy,
  kind = 'course',
}: {
  courseId: string
  value: string
  onChange: (value: string) => void
  onBusy: (busy: boolean) => void
  kind?: 'course' | 'quiz'
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  async function upload(file: File) {
    setError('')
    if (!THUMBNAIL_TYPES.includes(file.type) || file.size > THUMBNAIL_MAX_BYTES) {
      setError('Choose a JPG, PNG, or WebP image up to 5 MB.')
      return
    }
    setBusy(true)
    onBusy(true)
    try {
      const form = new FormData()
      form.set('courseId', courseId)
      form.set('file', file)
      const response = await fetch('/api/course-thumbnail', { method: 'POST', body: form })
      const reply = await response.json()
      if (!response.ok) throw new Error(reply.error || 'Image upload failed.')
      onChange(reply.url)
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Image upload failed. Try again.')
    } finally {
      setBusy(false)
      onBusy(false)
    }
  }
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-semibold">
        {kind === 'quiz' ? 'Custom quiz thumbnail' : 'Course thumbnail'}
      </h4>
      <div
        className={`relative overflow-hidden rounded-xl border border-slate-200 bg-slate-50 ${value ? 'aspect-video' : 'h-24 border-dashed'}`}
      >
        {value ? (
          <Image
            src={value}
            alt={`${kind} thumbnail preview`}
            fill
            sizes="(max-width: 1024px) 100vw, 400px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full items-center justify-center text-sm text-slate-400">
            No thumbnail yet
          </div>
        )}
      </div>
      <p id={`${kind}-thumbnail-requirements`} className="text-xs leading-5 text-slate-500">
        <strong>16:9 required</strong> · 1280 × 720 px recommended.
        <span className="block">Min. 640 × 360 px · JPG, PNG or WebP · Up to 5 MB.</span>
      </p>
      <label
        className={`${secondaryClass} relative focus-within:ring-2 focus-within:ring-brand-500 ${busy ? 'opacity-50' : 'cursor-pointer'}`}
      >
        {busy ? 'Uploading…' : value ? 'Replace thumbnail' : 'Upload thumbnail'}
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp"
          disabled={busy}
          aria-label={`${value ? 'Replace' : 'Upload'} ${kind} thumbnail`}
          aria-describedby={`${kind}-thumbnail-requirements`}
          className="absolute inset-0 w-full cursor-pointer opacity-0"
          onChange={(event) => {
            const file = event.target.files?.[0]
            event.target.value = ''
            if (file) void upload(file)
          }}
        />
      </label>
      {value && (
        <button
          type="button"
          className="ml-3 text-xs font-semibold text-rose-600 disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            onChange('')
            setError('')
          }}
        >
          Remove thumbnail
        </button>
      )}
      {error && (
        <p role="alert" className="text-sm text-rose-600">
          {error}
        </p>
      )}
      {value && <p className="text-xs text-slate-400">Save the {kind} to apply changes.</p>}
    </div>
  )
}
