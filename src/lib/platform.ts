import { config } from './config'

export const storage = {
  read<T>(key: string, fallback: T): T {
    try {
      const value = localStorage.getItem(`sgw:${key}`)
      return value === null ? fallback : (JSON.parse(value) as T)
    } catch {
      return fallback
    }
  },
  write(key: string, value: unknown) {
    try {
      localStorage.setItem(`sgw:${key}`, JSON.stringify(value))
      return true
    } catch {
      return false
    }
  },
  remove(key: string) {
    try {
      localStorage.removeItem(`sgw:${key}`)
    } catch {
      /* Private browsing may block storage. */
    }
  },
}
export function invitation(code: string) {
  return `${config.appUrl || location.origin}/?join=${encodeURIComponent(code)}`
}
export async function copyText(text: string) {
  await navigator.clipboard.writeText(text)
}
export async function shareRoom(code: string) {
  if (navigator.share)
    await navigator.share({
      title: 'A questionable invitation',
      text: 'Play Subjective Guess Who with me!',
      url: invitation(code),
    })
  else await copyText(invitation(code))
}
export function navigateRoom(id?: string) {
  const target = id ? `/?room=${encodeURIComponent(id)}` : '/'
  history.pushState(null, '', target)
  dispatchEvent(new PopStateEvent('popstate'))
}
export function newId(): string {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  // Custom HTTP development hosts lack randomUUID, but still expose getRandomValues.
  const bytes = crypto.getRandomValues(new Uint8Array(16))
  bytes[6] = (bytes[6]! & 0x0f) | 0x40
  bytes[8] = (bytes[8]! & 0x3f) | 0x80
  const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, '0')).join('')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
