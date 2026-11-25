import type { RoomState } from './types'

export const MAX_QUESTION = 75
export const characterCount = (text: string) => Array.from(text).length
export const trimQuestion = (text: string) =>
  Array.from(text.replace(/[\r\n\t]/g, ' '))
    .slice(0, MAX_QUESTION)
    .join('')
export function secondsRemaining(deadline: string | null, clockOffset: number, now: number) {
  return deadline ? Math.max(0, Math.ceil((Date.parse(deadline) - now - clockOffset) / 1000)) : 0
}
export function isNewerState(current: RoomState | null, next: RoomState) {
  return (
    !current ||
    current.roomId !== next.roomId ||
    current.you !== next.you ||
    next.version >= current.version
  )
}
