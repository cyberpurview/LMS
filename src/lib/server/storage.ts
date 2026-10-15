import 'server-only'
import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from '@/lib/supabase/config'

export function storageAdmin(timeoutMs?: number) {
  const secret = process.env.SUPABASE_SECRET_KEY
  if (!secret) throw new Error('File uploads are unavailable. Contact the platform administrator.')
  return createClient(supabaseConfig().url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: timeoutMs
      ? {
          fetch: (input, options) =>
            fetch(input, {
              ...options,
              signal: options?.signal
                ? AbortSignal.any([options.signal, AbortSignal.timeout(timeoutMs)])
                : AbortSignal.timeout(timeoutMs),
            }),
        }
      : undefined,
  })
}
