export type DashboardTheme = 'light' | 'dark' | 'system'
export const LOADING_THEME_KEY = 'cyberpurview:loading-appearance'
// The early loader remembers appearance only; dashboard preferences remain account-specific.
export function loadingThemeBootstrap() {
  return `(function(){var p='system';try{p=localStorage.getItem('${LOADING_THEME_KEY}')||'system'}catch(e){}document.documentElement.dataset.loadingPreference=(p==='dark'||p==='light')?p:'system'})()`
}
export function validTheme(value: unknown): DashboardTheme {
  return value === 'light' || value === 'dark' ? value : 'system'
}
export function resolvedTheme(preference: DashboardTheme, systemDark: boolean) {
  return preference === 'system' ? (systemDark ? 'dark' : 'light') : preference
}
export function themeStorageKey(userId: string) {
  return `cyberpurview:appearance:${userId}`
}
// Runs before dashboard markup is painted, without changing public/authentication pages.
export function themeBootstrap(userId: string) {
  const key = JSON.stringify(themeStorageKey(userId)).replace(/</g, '\\u003c')
  return `(function(){var p='system';try{p=localStorage.getItem(${key})||'system'}catch(e){}document.documentElement.dataset.dashboardTheme=(p==='dark'||(p!=='light'&&window.matchMedia('(prefers-color-scheme: dark)').matches))?'dark':'light'})()`
}
