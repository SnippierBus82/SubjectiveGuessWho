import { config } from '../lib/config'
import type { GameService } from '../game/types'

let instance: Promise<GameService> | undefined
export function getService() {
  if (config.incomplete)
    return Promise.reject(
      new Error('Add both Supabase environment variables, then restart the app.'),
    )
  instance ??= config.online
    ? import('./supabase').then((module) => module.createSupabaseService())
    : import('./preview').then((module) => module.createPreviewService())
  return instance
}
