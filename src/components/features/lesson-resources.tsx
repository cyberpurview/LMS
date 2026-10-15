'use client'
import { useEffect, useRef, useState } from 'react'
import { X, ExternalLink, Download, Trash2 } from 'lucide-react'
import { RESOURCE_MAX_BYTES, RESOURCE_MAX_FILES, type LessonResource } from '@/lib/lms/resources'

export function LessonResources({
  lessonId,
  editable = false,
  saved = true,
  beforeUpload,
  onUploadStateChange,
}: {
  lessonId: string
  editable?: boolean
  saved?: boolean
  beforeUpload?: () => Promise<void>
  onUploadStateChange?: (active: boolean) => void
}) {
  const [resources, setResources] = useState<LessonResource[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')
  const [retry, setRetry] = useState(0)
  const [confirmRemove, setConfirmRemove] = useState('')
  const [viewer, setViewer] = useState<{ resource: LessonResource; url: string } | null>(null)
  const [previewing, setPreviewing] = useState('')
  const [viewerLoading, setViewerLoading] = useState(false)
  const viewerVersion = useRef(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const resourceVersion = useRef(0)
  useEffect(() => {
    if (!saved) {
      setResources([])
      setLoading(false)
      return
    }
    const controller = new AbortController()
    const previewGeneration = viewerVersion
    const listVersion = resourceVersion.current
    setLoading(true)
    setPreviewing('')
    setError('')
    fetch(`/api/lesson-resources?lessonId=${lessonId}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const data = await response.json()
        if (!response.ok) throw new Error(data.error || 'Unable to load resources.')
        if (listVersion === resourceVersion.current) setResources(data.resources)
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Unable to load resources.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => {
      controller.abort()
      previewGeneration.current++
    }
  }, [lessonId, retry, saved])
  async function upload(file?: File) {
    if (!file || busy) return
    setError('')
    setMessage('')
    if (!file.name.toLowerCase().endsWith('.pdf')) {
      setError('Choose a PDF file.')
      return
    }
    if (file.size > RESOURCE_MAX_BYTES) {
      setError('Choose a PDF up to 20 MB.')
      return
    }
    setBusy(true)
    let trackedUpload = false
    try {
      await beforeUpload?.()
      trackedUpload = true
      onUploadStateChange?.(true)
      const form = new FormData()
      form.set('lessonId', lessonId)
      form.set('file', file)
      const response = await fetch('/api/lesson-resources', { method: 'POST', body: form })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Upload failed.')
      resourceVersion.current++
      setResources((current) => [...current, data.resource])
      setMessage('PDF added. Enrolled learners can now access it.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setBusy(false)
      if (fileRef.current) fileRef.current.value = ''
      if (trackedUpload) onUploadStateChange?.(false)
    }
  }
  async function remove(resource: LessonResource) {
    setBusy(true)
    setError('')
    setMessage('')
    try {
      const response = await fetch(`/api/lesson-resources?id=${resource.id}`, { method: 'DELETE' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to remove PDF.')
      resourceVersion.current++
      setResources((current) => current.filter((r) => r.id !== resource.id))
      if (viewer?.resource.id === resource.id) {
        viewerVersion.current++
        setViewer(null)
        setPreviewing('')
      }
      setConfirmRemove('')
      setMessage('PDF removed from this lesson.')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to remove PDF.')
    } finally {
      setBusy(false)
    }
  }
  async function preview(resource: LessonResource) {
    const version = ++viewerVersion.current
    setPreviewing(resource.id)
    setError('')
    try {
      const response = await fetch(`/api/lesson-resources?id=${resource.id}`, { cache: 'no-store' })
      const data = await response.json()
      if (!response.ok) throw new Error(data.error || 'Unable to open PDF.')
      if (version !== viewerVersion.current) return
      setViewerLoading(true)
      setViewer({ resource, url: data.url })
    } catch (e) {
      if (version === viewerVersion.current)
        setError(e instanceof Error ? e.message : 'Unable to open PDF.')
    } finally {
      if (version === viewerVersion.current) setPreviewing('')
    }
  }
  return (
    <section className="w-full space-y-3 rounded-xl border border-slate-200 bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h4 className="text-sm font-semibold">PDF resources</h4>
          {editable && (
            <p id={`resource-help-${lessonId}`} className="mt-1 text-xs text-slate-500">
              Up to 20 MB each · {resources.length}/{RESOURCE_MAX_FILES} files
            </p>
          )}
        </div>
        {editable && (
          <button
            type="button"
            className="rounded-lg border border-slate-200 px-3 py-2 text-xs font-medium text-slate-700 transition hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={busy || loading || resources.length >= RESOURCE_MAX_FILES}
            onClick={() => fileRef.current?.click()}
            title="Add a PDF without password protection"
          >
            Add PDF
          </button>
        )}
      </div>
      {editable && (
        <>
          <input
            ref={fileRef}
            id={`resource-upload-${lessonId}`}
            type="file"
            accept=".pdf,application/pdf"
            className="hidden"
            aria-label="Add a PDF resource"
            aria-describedby={`resource-help-${lessonId}`}
            disabled={busy || loading || resources.length >= RESOURCE_MAX_FILES}
            onChange={(e) => void upload(e.target.files?.[0])}
          />
          {!saved && (
            <p className="text-xs text-slate-500">
              The first upload saves this lesson. Add a course title and select a tutor first.
            </p>
          )}
        </>
      )}
      {loading ? (
        <p role="status" className="text-sm text-slate-500">
          Loading resources…
        </p>
      ) : (
        !resources.length && !error && <p className="text-xs text-slate-400">No PDFs added yet.</p>
      )}
      {busy && (
        <p role="status" className="text-sm text-brand-600">
          Saving resource changes…
        </p>
      )}
      {error && (
        <div role="alert" className="text-sm text-rose-600">
          {error}{' '}
          <button
            type="button"
            className="underline ml-2"
            disabled={busy}
            onClick={() => setRetry((n) => n + 1)}
          >
            Reload resources
          </button>
        </div>
      )}
      {message && (
        <p role="status" className="text-sm text-emerald-700">
          {message}
        </p>
      )}
      <ul className="divide-y divide-slate-100">
        {resources.map((resource) => (
          <li key={resource.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 py-3">
            <div className="min-w-0 flex-1 basis-48">
              <p className="font-medium text-sm break-words">{resource.name}</p>
              <p className="text-xs text-slate-400 mt-1">
                {resource.pages} pages · {(resource.bytes / (1024 * 1024)).toFixed(2)} MB
              </p>
            </div>
            <div className="flex flex-wrap gap-3 items-center">
              <button
                type="button"
                className="text-xs font-medium text-brand-600 hover:underline disabled:opacity-50"
                disabled={busy || !!previewing}
                onClick={() => void preview(resource)}
              >
                {previewing === resource.id ? 'Opening…' : 'Preview PDF'}
              </button>
              <a
                className="text-xs font-medium text-slate-600 flex gap-1 items-center hover:underline"
                href={`/api/lesson-resources?id=${resource.id}&download=1`}
              >
                <Download className="w-4 h-4" />
                Download
              </a>
              {editable && (
                <button
                  type="button"
                  disabled={busy}
                  className="text-xs text-rose-600 flex gap-1 items-center hover:underline disabled:opacity-50"
                  onClick={() => setConfirmRemove(resource.id)}
                >
                  <Trash2 className="w-4 h-4" />
                  Remove
                </button>
              )}
            </div>
            {editable && confirmRemove === resource.id && (
              <div className="w-full text-sm bg-rose-50 rounded-lg p-3 space-y-2">
                <p>Remove this PDF from the lesson?</p>
                <div className="flex gap-4">
                  <button
                    type="button"
                    disabled={busy}
                    className="text-rose-700 font-semibold"
                    onClick={() => void remove(resource)}
                  >
                    Yes, remove
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirmRemove('')}>
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </li>
        ))}
      </ul>
      {viewer && (
        <div className="overflow-hidden rounded-xl border border-slate-200">
          <div className="bg-slate-50 p-3 flex flex-wrap items-center gap-3">
            <p className="flex-1 font-medium text-sm break-words">{viewer.resource.name}</p>
            <a
              className="text-sm text-brand-600 flex gap-1 items-center"
              href={`/api/lesson-resources?id=${viewer.resource.id}&open=1`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <ExternalLink className="w-4 h-4" />
              Open in new tab
            </a>
            <button
              type="button"
              aria-label="Close PDF viewer"
              onClick={() => {
                viewerVersion.current++
                setViewer(null)
                setPreviewing('')
                setViewerLoading(false)
              }}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          {viewerLoading && (
            <p role="status" className="p-3 text-sm text-slate-500">
              Loading PDF viewer…
            </p>
          )}
          <iframe
            key={viewer.url}
            src={viewer.url}
            title={`PDF viewer: ${viewer.resource.name}`}
            referrerPolicy="no-referrer"
            className="w-full h-[65vh] min-h-[420px] bg-slate-100"
            onLoad={() => setViewerLoading(false)}
          />
          <p className="p-3 text-xs text-slate-500">
            Use the viewer controls to zoom and move between pages. If your browser cannot display
            the PDF, open it in a new tab or download it.
          </p>
        </div>
      )}
    </section>
  )
}
