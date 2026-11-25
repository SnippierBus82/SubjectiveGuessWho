import type { Timings } from './types'
export const ROOM_PACES = {
  Fast: { question: 60, answer: 15, review: 30 },
  Normal: { question: 120, answer: 30, review: 60 },
  Slow: { question: 180, answer: 60, review: 90 },
  Timeless: { question: null, answer: null, review: null },
} satisfies Record<string, Timings>
export const DEFAULT_TIMINGS: Timings = ROOM_PACES.Normal

export function paceName(timings: Timings) {
  return (
    Object.entries(ROOM_PACES).find(
      ([, pace]) =>
        pace.question === timings.question &&
        pace.answer === timings.answer &&
        pace.review === timings.review,
    )?.[0] ?? 'Custom'
  )
}
export const TIMER_OPTIONS = {
  question: [60, 90, 120, 180, 300],
  answer: [15, 30, 45, 60, 90, 120],
  review: [15, 30, 45, 60, 90, 120],
} as const
export function validTimings(t: Timings) {
  return (
    Object.entries(TIMER_OPTIONS).every(([key, values]) => {
      const v = t[key as keyof Timings]
      return v === null || (values as readonly number[]).includes(v)
    }) &&
    (t.question === null || t.review === null || t.review <= t.question)
  )
}
export function reviewEnd(start: number, submitted: number, timings: Timings) {
  if (timings.review === null) return null
  const end = Math.max(start + timings.review * 1000, submitted + 20000)
  return timings.question === null ? end : Math.min(start + timings.question * 1000, end)
}
export const timeLabel = (seconds: number | null) =>
  seconds === null
    ? 'Unlimited'
    : seconds >= 60 && seconds % 60 === 0
      ? `${seconds / 60} min`
      : `${seconds}s`
