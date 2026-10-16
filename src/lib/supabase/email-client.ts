import { createClient } from '@supabase/supabase-js'
import { supabaseConfig } from './config'

/** Default hosted emails return a session fragment and must work in another browser.
 * Only email requests use this stateless client; workspace sessions stay in SSR cookies.
 */
export function createEmailClient() {
  const { url, key } = supabaseConfig()
  return createClient(url, key, {
    auth: {
      flowType: 'implicit',
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false,
    },
  })
}
