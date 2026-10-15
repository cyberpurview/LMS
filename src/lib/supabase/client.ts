import { createBrowserClient } from '@supabase/ssr'
import { supabaseConfig } from './config'
import type { Database } from '@/types/database.types'

export function createClient() {
  const { url, key } = supabaseConfig()
  return createBrowserClient<Database>(url, key, { auth: { detectSessionInUrl: false } })
}
