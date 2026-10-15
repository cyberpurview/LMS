import type { Role } from '@/types'

export function safeWorkspacePath(next: string | null, origin: string, role?: Role) {
  if (
    !next?.startsWith('/') ||
    next.length > 2048 ||
    next.startsWith('//') ||
    next.includes('\\') ||
    /[\x00-\x1f\x7f]/.test(next)
  )
    return null
  try {
    const target = new URL(next, origin)
    const match = target.pathname.match(/^\/(admin|tutor|learner)(\/|$)/)
    if (target.origin !== origin || !match || (role && match[1] !== role)) return null
    return target.pathname + target.search + target.hash
  } catch {
    return null
  }
}

export function googleOAuthOptions(origin: string, next: string | null) {
  const callback = new URL('/auth/callback', origin)
  callback.searchParams.set('provider', 'google')
  const destination = safeWorkspacePath(next, origin)
  if (destination) callback.searchParams.set('next', destination)
  return {
    provider: 'google' as const,
    options: {
      redirectTo: callback.toString(),
      skipBrowserRedirect: true,
      queryParams: { prompt: 'select_account' },
    },
  }
}
