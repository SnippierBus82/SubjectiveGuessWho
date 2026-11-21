import type { Timings } from './types'
export const DEFAULT_TIMINGS: Timings = { question: 120, answer: 30, review: 60 }
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
