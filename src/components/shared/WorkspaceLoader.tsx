import { BrandLogo } from './BrandLogo'
import { BRAND_NAME } from '@/lib/brand'

export function WorkspaceLoader() {
  return (
    <div
      role="status"
      data-workspace-loader
      aria-live="polite"
      className="flex min-h-[100dvh] items-center justify-center p-8"
    >
      <span className="sr-only">Loading your workspace. Please wait.</span>
      <div aria-hidden="true" className="flex flex-col items-center">
        <div className="relative flex h-36 w-36 items-center justify-center">
          <div className="workspace-loader-halo absolute inset-0 rounded-full border" />
          <svg
            className="workspace-loader-orbit absolute inset-2 h-32 w-32"
            viewBox="0 0 128 128"
            fill="none"
          >
            <circle cx="64" cy="64" r="60" stroke="var(--loader-border)" strokeWidth="1.5" />
            <circle
              cx="64"
              cy="64"
              r="60"
              stroke="var(--brand-primary)"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeDasharray="75 302"
            />
          </svg>
          <div
            data-loader-logo-panel
            className="relative flex h-24 w-24 items-center justify-center rounded-3xl border shadow-sm"
          >
            <BrandLogo iconOnly className="h-14 w-14" />
          </div>
        </div>
        <p className="mt-6 text-lg font-semibold tracking-tight">{BRAND_NAME}</p>
        <div className="mt-4 flex gap-2">
          {[0, 1, 2].map((dot) => (
            <span
              key={dot}
              className="workspace-loader-dot h-1.5 w-1.5 rounded-full bg-brand-500"
              style={{ animationDelay: `${dot * 160}ms` }}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
