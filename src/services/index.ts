import { config } from '../lib/config'
import type { GameService } from '../game/types'

let instance: Promise<GameService> | undefined
// Vite can evaluate both timestamped and bare module URLs during a folder refresh.
// They must share one service, subscription set and preview record in this page.
const developmentCache = import.meta.hot
  ? ((
      globalThis as typeof globalThis & { __sgwService?: { instance?: Promise<GameService> } }
    ).__sgwService ??= {})
  : undefined
export function getService() {
  if (config.incomplete)
    return Promise.reject(
      new Error('Add both Supabase environment variables, then restart the app.'),
    )
  instance ??= developmentCache?.instance
  instance ??= config.online
    ? import('./supabase').then((module) => module.createSupabaseService())
    : import('./preview').then((module) => module.createPreviewService())
  if (developmentCache) developmentCache.instance = instance
  return instance
}
