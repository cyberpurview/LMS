'use client'
import { createContext, useContext, useLayoutEffect, useState } from 'react'
import {
  resolvedTheme,
  LOADING_THEME_KEY,
  themeStorageKey,
  validTheme,
  type DashboardTheme,
} from '@/lib/lms/theme'

const Context = createContext<{
  theme: DashboardTheme
  setTheme: (theme: DashboardTheme) => void
} | null>(null)
export function DashboardThemeProvider({
  userId,
  children,
}: {
  userId: string
  children: React.ReactNode
}) {
  const [theme, updateTheme] = useState<DashboardTheme>('system')
  const key = themeStorageKey(userId)
  useLayoutEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    let preference: DashboardTheme = 'system'
    const apply = () => {
      document.documentElement.dataset.dashboardTheme = resolvedTheme(preference, media.matches)
      document.documentElement.dataset.loadingPreference = preference
      try {
        localStorage.setItem(LOADING_THEME_KEY, preference)
      } catch {
        // The current loading screen still follows the in-memory preference.
      }
    }
    const read = () => {
      try {
        preference = validTheme(localStorage.getItem(key))
      } catch {
        preference = 'system'
      }
      updateTheme(preference)
      apply()
    }
    const storage = (event: StorageEvent) => {
      if (event.key === key || event.key === null) read()
    }
    const change = (event: Event) => {
      preference = validTheme((event as CustomEvent).detail)
      updateTheme(preference)
      apply()
    }
    read()
    media.addEventListener('change', apply)
    window.addEventListener('storage', storage)
    window.addEventListener('dashboard-appearance', change)
    return () => {
      media.removeEventListener('change', apply)
      window.removeEventListener('storage', storage)
      window.removeEventListener('dashboard-appearance', change)
      delete document.documentElement.dataset.dashboardTheme
    }
  }, [key])
  function setTheme(value: DashboardTheme) {
    const next = validTheme(value)
    try {
      localStorage.setItem(key, next)
    } catch {
      /* Theme remains usable when storage is unavailable. */
    }
    window.dispatchEvent(new CustomEvent('dashboard-appearance', { detail: next }))
  }
  return <Context.Provider value={{ theme, setTheme }}>{children}</Context.Provider>
}
export function ThemeSelector() {
  const context = useContext(Context)
  if (!context) return null
  return (
    <fieldset className="border-t border-slate-100 px-3 py-3">
      <legend className="sr-only">Dashboard appearance</legend>
      <p className="mb-2 text-xs font-medium text-slate-500">Appearance</p>
      <div className="grid grid-cols-3 gap-1 rounded-lg bg-slate-50 p-1">
        {(['light', 'dark', 'system'] as const).map((value) => (
          <button
            key={value}
            type="button"
            aria-pressed={context.theme === value}
            onClick={() => context.setTheme(value)}
            className={`rounded-md px-1 py-2 text-xs font-medium capitalize focus-visible:outline-brand-600 ${context.theme === value ? 'bg-brand-50 text-brand-700 ring-1 ring-brand-500' : 'text-slate-600 hover:bg-slate-100'}`}
          >
            {value}
          </button>
        ))}
      </div>
    </fieldset>
  )
}
