import { describe, expect, it } from 'vitest'
import {
  characterCount,
  isNewerState,
  MAX_QUESTION,
  secondsRemaining,
  trimQuestion,
} from '../src/game/rules'
import { PLAYABLE_QUESTION_CATEGORIES, QUESTION_LIBRARY } from '../src/game/questions'
import { DEFAULT_TIMINGS, paceName, reviewEnd, ROOM_PACES, validTimings } from '../src/game/timings'
import type { RoomState } from '../src/game/types'

describe('client timing and reconciliation', () => {
  it('corrects a device clock that is 8 seconds behind the server', () => {
    expect(secondsRemaining('2026-11-15T12:00:30Z', 8000, Date.parse('2026-11-15T12:00:02Z'))).toBe(
      20,
    )
    expect(secondsRemaining('2026-11-15T12:00:00Z', 0, Date.parse('2026-11-15T12:00:30Z'))).toBe(0)
  })
  it('counts Unicode code points consistently with PostgreSQL', () => {
    expect(characterCount('🤨'.repeat(75))).toBe(75)
    expect(characterCount(trimQuestion('🤨'.repeat(76)))).toBe(75)
    expect(trimQuestion('hello\nworld')).toBe('hello world')
  })
  it('ignores out-of-order snapshots but accepts rematches and changed seats', () => {
    const state = { roomId: 'one', you: 'a', version: 10 } as RoomState
    expect(isNewerState(state, { ...state, version: 9 })).toBe(false)
    expect(isNewerState(state, { ...state, version: 11 })).toBe(true)
    expect(isNewerState(state, { ...state, you: 'b' })).toBe(true)
  })
})

describe('question library and timer settings', () => {
  it('recognizes exact presets and labels other valid combinations Custom', () => {
    expect(paceName(DEFAULT_TIMINGS)).toBe('Normal')
    for (const [name, timings] of Object.entries(ROOM_PACES)) {
      expect(validTimings(timings)).toBe(true)
      expect(paceName({ ...timings })).toBe(name)
    }
    expect(paceName({ ...ROOM_PACES.Fast, answer: null })).toBe('Custom')
  })

  it('keeps authored questions unique and exposes only playable ideas', () => {
    expect(new Set(QUESTION_LIBRARY).size).toBe(QUESTION_LIBRARY.length)
    const playable = PLAYABLE_QUESTION_CATEGORIES.flatMap(({ questions }) => questions)
    expect(playable).not.toHaveLength(0)
    expect(playable).toEqual(QUESTION_LIBRARY.filter((q) => characterCount(q) <= MAX_QUESTION))
    expect(PLAYABLE_QUESTION_CATEGORIES.every(({ questions }) => questions.length > 0)).toBe(true)
  })

  it('implements the agreed timing examples including unlimited caps', () => {
    for (const [s, end] of [
      [15, 60],
      [50, 70],
      [85, 105],
      [110, 120],
    ])
      expect(reviewEnd(0, s! * 1000, DEFAULT_TIMINGS)).toBe(end! * 1000)
    expect(reviewEnd(0, 140000, { question: null, answer: 30, review: 60 })).toBe(160000)
    expect(reviewEnd(0, 10000, { question: 120, answer: 30, review: null })).toBeNull()
  })
})
