import 'server-only'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { supabaseConfig } from './config'
import type { Database } from '@/types/database.types'

export async function createClient() {
  const jar = await cookies()
  const { url, key } = supabaseConfig()
  return createServerClient<Database>(url, key, {
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        try {
          values.forEach(({ name, value, options }) => jar.set(name, value, options))
        } catch {
          // Server Components are read-only. Middleware refreshes their session cookies.
        }
      },
    },
  })
}
