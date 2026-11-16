import { describe, expect, it } from 'vitest'
import { characterCount, isNewerState, secondsRemaining, trimQuestion } from '../src/game/rules'
import type { RoomState } from '../src/game/types'

describe('client timing and reconciliation', () => {
  it('corrects a device clock that is 8 seconds behind the server', () => {
    expect(secondsRemaining('2026-11-15T12:00:30Z', 8000, Date.parse('2026-11-15T12:00:02Z'))).toBe(
      20,
    )
    expect(secondsRemaining('2026-11-15T12:00:00Z', 0, Date.parse('2026-11-15T12:00:30Z'))).toBe(0)
  })
  it('counts Unicode code points consistently with PostgreSQL', () => {
    expect(characterCount('🤨'.repeat(50))).toBe(50)
    expect(characterCount(trimQuestion('🤨'.repeat(80)))).toBe(50)
    expect(trimQuestion('hello\nworld')).toBe('hello world')
  })
  it('ignores out-of-order snapshots but accepts rematches and changed seats', () => {
    const state = { roomId: 'one', you: 'a', version: 10 } as RoomState
    expect(isNewerState(state, { ...state, version: 9 })).toBe(false)
    expect(isNewerState(state, { ...state, version: 11 })).toBe(true)
    expect(isNewerState(state, { ...state, you: 'b' })).toBe(true)
  })
})
