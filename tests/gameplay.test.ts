import { beforeAll, afterAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeDatabase, users, prepareTestBoard, type RpcResponse } from './support/database'
import { AI_BOARD } from '../src/game/board-model'
import { DEFAULT_TIMINGS } from '../src/game/timings'
import type { MatchStatus, RoomState, Timings } from '../src/game/types'
let db: Awaited<ReturnType<typeof makeDatabase>>
const a = users[0]!,
  b = users[1]!,
  c = users[2]!
const unwrap = (r: RpcResponse) => {
  expect(r.error).toBeUndefined()
  expect(r.state).toBeDefined()
  return r.state!
}
const create = async (settings: Timings = DEFAULT_TIMINGS) =>
  prepareTestBoard(
    db,
    a,
    unwrap(await db.rpc(a, 'create_room_board_v2', ['Alice', randomUUID(), settings, AI_BOARD])),
  )
const action = (s: RoomState, u: string, k: string, p = {}) =>
  db.rpc(u, 'game_action_v2', [s.roomId, s.game.id, s.game.turn, randomUUID(), k, p])
const snap = async (s: RoomState, u = a) => unwrap(await db.rpc(u, 'get_room_v2', [s.roomId]))
async function playing(settings = DEFAULT_TIMINGS) {
  let s = await create(settings)
  s = unwrap(await db.rpc(b, 'join_room_v2', [s.code, 'Bob']))
  unwrap(await action(s, a, 'select', { characterId: 'p01' }))
  unwrap(await action(s, b, 'select', { characterId: 'p02' }))
  const ready = await Promise.all([action(s, a, 'ready'), action(s, b, 'ready')])
  ready.forEach(unwrap)
  return snap(s, b)
}
async function secondTurn(settings = DEFAULT_TIMINGS) {
  let s = await playing(settings)
  const writer = s.game.activePlayer!
  const reviewer = writer === a ? b : a
  s = unwrap(await action(s, writer, 'question', { text: 'Would they start a podcast?' }))
  return unwrap(await action(s, reviewer, 'answer', { answer: true }))
}
beforeAll(async () => {
  db = await makeDatabase()
})
beforeEach(async () => db.reset())
afterAll(async () => db?.close())
describe('gameplay', () => {
  it('persists the same prepared cast for both players and keeps secrets private', async () => {
    const s = await playing()
    const other = await snap(s, b)
    expect(s.game.turn).toBe(1)
    expect(s.board).toHaveLength(24)
    expect(other.board).toEqual(s.board)
    expect(s.myCharacter).toBe('p02')
    expect((await snap(s, a)).myCharacter).toBe('p01')
    expect(s.reveals).toBeNull()
    await expect(
      db.as(c, (x) => x.query('select * from private.selections')),
    ).rejects.toMatchObject({ code: '42501' })
    expect(
      (await db.as(c, (x) => x.query('select * from public.game_characters'))).rows,
    ).toHaveLength(0)
    expect((await action(s, c, 'answer', { answer: true })).error).toBeDefined()
  })
  it('auto-finishes review and starts a fresh answer clock', async () => {
    let s = await secondTurn()
    const writer = s.game.activePlayer!
    s = unwrap(await action(s, writer, 'question', { text: 'Would they like camping?' }))
    await db.admin.query(
      "update public.games set deadline=clock_timestamp()-interval '1 second' where id=$1",
      [s.game.id],
    )
    s = await snap(s)
    expect(s.game.phase).toBe('answer')
    expect(s.history).toHaveLength(2)
    expect(Date.parse(s.game.deadline!) - Date.parse(s.serverNow)).toBeGreaterThan(29000)
  })
  it.each(['question', 'answer'])(
    'pauses an expired %s without skipping or inventing an answer',
    async (phase) => {
      let s = await playing()
      if (phase === 'answer')
        s = unwrap(await action(s, s.game.activePlayer!, 'question', { text: 'Would they camp?' }))
      await db.admin.query(
        "update public.games set deadline=clock_timestamp()-interval '95 seconds' where id=$1",
        [s.game.id],
      )
      s = await snap(s)
      expect(s.game.phase).toBe('paused')
      expect(s.game.turn).toBe(1)
      expect(s.history.every((q) => q.answer === null && q.status === 'pending')).toBe(true)
      s = unwrap(await action(s, a, 'resume'))
      s = unwrap(await action(s, b, 'resume'))
      expect(s.game.phase).toBe(phase)
      expect(Date.parse(s.game.deadline!) - Date.parse(s.serverNow)).toBeGreaterThan(
        phase === 'answer' ? 29000 : 119000,
      )
    },
  )
  it('allows unlimited review and writing to finish manually', async () => {
    let s = await secondTurn({ question: null, answer: null, review: null })
    const writer = s.game.activePlayer!,
      other = writer === a ? b : a
    expect(s.game.deadline).toBeNull()
    s = unwrap(await action(s, writer, 'question', { text: 'Would they camp?' }))
    expect(s.game.deadline).toBeNull()
    s = unwrap(await action(s, other, 'review'))
    expect(s.game.phase).toBe('answer')
    expect(s.game.deadline).toBeNull()
  })
  it('keeps remaining time after a disconnect instead of resetting the activity', async () => {
    let s = await playing()
    await db.admin.query(
      "update public.games set deadline=clock_timestamp()+interval '60 seconds',writing_deadline=clock_timestamp()+interval '60 seconds' where id=$1",
      [s.game.id],
    )
    await db.admin.query(
      "update public.room_players set last_seen=clock_timestamp()-interval '50 seconds' where room_id=$1 and user_id=$2",
      [s.roomId, a],
    )
    s = await snap(s, a)
    expect(s.game.phase).toBe('paused')
    s = unwrap(await action(s, a, 'resume'))
    s = unwrap(await action(s, b, 'resume'))
    const remaining = Date.parse(s.game.deadline!) - Date.parse(s.serverNow)
    expect(remaining).toBeGreaterThan(64000)
    expect(remaining).toBeLessThan(66000)
  })
  it('removes the writing cap when only writing is unlimited', async () => {
    let s = await secondTurn({ question: null, answer: 30, review: 60 })
    await db.admin.query(
      "update public.games set started_at=clock_timestamp()-interval '140 seconds' where id=$1",
      [s.game.id],
    )
    s = unwrap(await action(s, s.game.activePlayer!, 'question', { text: 'Would they camp?' }))
    const elapsed = Date.parse(s.game.flow!.reviewDeadline!) - Date.parse(s.game.flow!.startedAt!)
    expect(elapsed).toBeGreaterThan(159000)
    expect(s.game.phase).toBe('question')
  })
  it('waits for manual review even when finite writing is complete', async () => {
    let s = await secondTurn({ question: 120, answer: 30, review: null })
    s = unwrap(await action(s, s.game.activePlayer!, 'question', { text: 'Would they camp?' }))
    expect(s.game.deadline).toBeNull()
    expect(s.game.phase).toBe('question')
  })
  it('detects stale leases even if the returning player calls the snapshot', async () => {
    let s = await playing()
    await db.admin.query(
      "update public.room_players set last_seen=clock_timestamp()-interval '50 seconds' where room_id=$1 and user_id=$2",
      [s.roomId, a],
    )
    s = await snap(s, a)
    expect(s.game.phase).toBe('paused')
    expect(s.game.pause?.reason).toBe('disconnect')
  })
  it('ends a paused game without winner after grace, and preserves pending questions', async () => {
    let s = await playing()
    s = unwrap(await action(s, s.game.activePlayer!, 'question', { text: 'Would they camp?' }))
    await db.admin.query(
      "update public.games set deadline=clock_timestamp()-interval '1 second' where id=$1",
      [s.game.id],
    )
    s = await snap(s)
    expect((await action(s, a, 'end')).error).toBeDefined()
    await db.admin.query(
      "update public.games set pause_data=jsonb_set(pause_data,'{since}',to_jsonb(clock_timestamp()-interval '121 seconds')) where id=$1",
      [s.game.id],
    )
    s = unwrap(await action(s, a, 'end'))
    expect(s.game.phase).toBe('finished')
    expect(s.game.winner).toBeNull()
    expect(s.history[0]!.answer).toBeNull()
  })
  it('guesses against the prepared board and rematches to a fresh cast', async () => {
    let s = await playing()
    const writer = s.game.activePlayer!
    const target = writer === a ? 'p02' : 'p01'
    const cast = s.board
    s = unwrap(await action(s, writer, 'guess', { characterId: target }))
    expect(s.game.winner).toBe(writer)
    expect(s.game.guessCharacter).toBe(target)
    s = unwrap(await action(s, a, 'rematch'))
    s = unwrap(await action(s, b, 'rematch'))
    expect(s.game.phase).toBe('lobby')
    expect(s.board).not.toEqual(cast)
    expect(s.settings).toEqual(DEFAULT_TIMINGS)
  })
  it('returns compact heartbeats until the room changes', async () => {
    const s = await create()
    const pulse = await db.rpc(a, 'heartbeat_room_v2', [s.roomId, s.version])
    expect(pulse.state).toBeUndefined()
    expect(pulse.version).toBe(s.version)
    expect((await db.rpc(c, 'heartbeat_room_v2', [s.roomId, s.version])).error).toBeDefined()
    unwrap(await action(s, a, 'select', { characterId: 'p01' }))
    expect((await db.rpc(a, 'heartbeat_room_v2', [s.roomId, s.version])).state?.myCharacter).toBe(
      'p01',
    )
  })
  it('validates malformed settings without throwing or creating rooms', async () => {
    for (const settings of [
      null,
      {},
      [],
      { question: '120', answer: 30, review: 60 },
      { question: 120, answer: false, review: 60 },
      { question: 120, answer: 30, review: 'invalid' },
    ]) {
      expect(
        (await db.rpc(a, 'create_room_board_v2', ['Alice', randomUUID(), settings, AI_BOARD]))
          .error,
      ).toBeDefined()
    }
    expect((await db.admin.query('select * from public.rooms')).rows).toHaveLength(0)
  })
  it('rejects invalid timers, wrong-board selections, and direct writes', async () => {
    expect(
      (
        await db.rpc(a, 'create_room_board_v2', [
          'Alice',
          randomUUID(),
          { question: 60, answer: 30, review: 120 },
          AI_BOARD,
        ])
      ).error,
    ).toBeDefined()
    const s = await create()
    expect((await action(s, a, 'select', { characterId: 'amara' })).error).toBeDefined()
    await expect(
      db.as(a, (x) => x.query('update public.games set review_ready=true')),
    ).rejects.toThrow()
  })
  it('authenticates reaction sender and bounds spam', async () => {
    const s = await playing()
    const id = randomUUID()
    expect((await db.rpc(a, 'send_reaction_v2', [s.roomId, id, '😂'])).error).toBeUndefined()
    const events = await db.admin.query(
      "select payload from realtime.messages where event='reaction'",
    )
    expect(events.rows[0]!.payload).toEqual({ id, emoji: '😂', from: a })
    expect(
      (await db.rpc(a, 'send_reaction_v2', [s.roomId, randomUUID(), '😂'])).error,
    ).toBeDefined()
    expect(
      (await db.rpc(c, 'send_reaction_v2', [s.roomId, randomUUID(), '😂'])).error,
    ).toBeDefined()
  })
})
describe('matchmaking', () => {
  const match = (u: string, cmd = 'join') =>
    db.rpc(u, 'matchmake_board_v2', ['Player', cmd, AI_BOARD]) as Promise<RpcResponse & MatchStatus>
  it('pairs waiting players once, resumes assignment, and blocks third players', async () => {
    expect((await match(a)).status).toBe('waiting')
    const m = await match(b)
    expect(m.status).toBe('matched')
    expect((await match(a, 'pulse')).roomId).toBe(m.roomId)
    const r = await db.admin.query('select code from public.rooms where id=$1', [m.roomId])
    expect((await db.rpc(c, 'join_room_v2', [r.rows[0]!.code, 'Third'])).error).toBeDefined()
  })
  it('serializes simultaneous admissions without double matches', async () => {
    const results = await Promise.all(users.slice(0, 8).map((u) => match(u)))
    expect(results.every((r) => !r.error)).toBe(true)
    const rooms = await db.admin.query(
      'select room_id,count(*)::integer n from public.room_players group by room_id',
    )
    expect(rooms.rows).toHaveLength(4)
    expect(rooms.rows.every((r) => r.n === 2)).toBe(true)
  })
  it('cancels, excludes expired tickets and renews leases', async () => {
    await match(a)
    await match(a, 'cancel')
    expect((await match(b)).status).toBe('waiting')
    await db.admin.query(
      "update private.match_queue set expires_at=clock_timestamp()-interval '1 second'",
    )
    expect((await match(a)).status).toBe('waiting')
    expect((await match(b, 'pulse')).status).toBe('idle')
  })
  it('gives the oldest valid waiting player priority', async () => {
    // Seed two eligible waiters to exercise indexed FIFO independently of arrivals.
    await db.admin.query(
      "insert into private.match_queue(user_id,board_id,nickname,queued_at) values($1,'ai-random','Older',clock_timestamp()-interval '20 seconds'),($2,'ai-random','Newer',clock_timestamp()-interval '10 seconds')",
      [a, b],
    )
    const m = await match(c)
    const players = await db.admin.query(
      'select user_id from public.room_players where room_id=$1',
      [m.roomId],
    )
    expect(players.rows.map((p) => p.user_id)).toContain(a)
    expect(players.rows.map((p) => p.user_id)).not.toContain(b)
  })
  it('serializes cancellation against assignment', async () => {
    await match(a)
    const [cancel, arrival] = await Promise.all([match(a, 'cancel'), match(b)])
    expect(cancel.error).toBeUndefined()
    expect(arrival.error).toBeUndefined()
    const groups = await db.admin.query(
      'select room_id,count(*)::integer n from public.room_players group by room_id',
    )
    expect(groups.rows.every((r) => r.n === 2)).toBe(true)
    const duplicates = await db.admin.query(
      'select user_id,count(*)::integer n from private.match_queue group by user_id having count(*)>1',
    )
    expect(duplicates.rows).toHaveLength(0)
  })
  it('admits either a private room or a waiting ticket, never both', async () => {
    const results = await Promise.all([
      db.rpc(a, 'create_room_board_v2', ['Alice', randomUUID(), DEFAULT_TIMINGS, AI_BOARD]),
      match(a),
    ])
    expect(results.filter((r) => r.error).length).toBe(1)
  })
  it('authorizes match notices only for their recipient', async () => {
    await db.admin.query('select private.match_notice($1)', [a])
    expect(
      (await db.as(a, (x) => x.query('select * from realtime.messages'), `match:${a}`)).rows,
    ).toHaveLength(1)
    expect(
      (await db.as(b, (x) => x.query('select * from realtime.messages'), `match:${a}`)).rows,
    ).toHaveLength(0)
    await expect(
      db.as(
        a,
        (x) =>
          x.query("insert into realtime.messages(topic,extension) values($1,'broadcast')", [
            `match:${a}`,
          ]),
        `match:${a}`,
      ),
    ).rejects.toThrow()
  })
  it('returns the ready survivor to search with original priority after a no-show', async () => {
    await match(a)
    const m = await match(b)
    const s = await prepareTestBoard(db, a, unwrap(await db.rpc(a, 'get_room_v2', [m.roomId])))
    unwrap(await action(s, a, 'select', { characterId: 'p01' }))
    unwrap(await action(s, a, 'ready'))
    const before = await db.admin.query(
      'select queued_at from private.match_queue where user_id=$1',
      [a],
    )
    await db.admin.query(
      "update public.games set created_at=clock_timestamp()-interval '121 seconds' where id=$1",
      [s.game.id],
    )
    expect((await match(a, 'pulse')).status).toBe('waiting')
    const after = await db.admin.query(
      'select queued_at from private.match_queue where user_id=$1',
      [a],
    )
    expect(after.rows).toEqual(before.rows)
  })
})
