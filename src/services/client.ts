import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { config } from '../lib/config'

let client: SupabaseClient | undefined
const cache = import.meta.hot
  ? ((
      globalThis as typeof globalThis & { __sgwClient?: { client?: SupabaseClient } }
    ).__sgwClient ??= {})
  : undefined

export function getSupabaseClient() {
  if (!config.online) throw new Error('Online play is not configured.')
  if (config.key.startsWith('sb_secret_'))
    throw new Error('Use a publishable Supabase key in the browser.')
  if (config.key.startsWith('ey')) {
    try {
      const payload = JSON.parse(
        atob(config.key.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')),
      )
      if (payload.role === 'service_role')
        throw new Error('A service_role key cannot be used in the browser.')
    } catch (error) {
      if (error instanceof Error && error.message.includes('service_role')) throw error
    }
  }
  client ??= cache?.client
  client ??= createClient(config.url, config.key, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
      flowType: 'pkce',
      storageKey: 'sgw-auth',
    },
    realtime: { params: { eventsPerSecond: 4 } },
  })
  if (cache) cache.client = client
  return client
}
