import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { stat } from 'node:fs/promises'
import { makeDatabase, users, type RpcResponse } from './support/database'
import { characters } from '../src/game/characters'
import type { RoomState } from '../src/game/types'

const a = users[0]!,
  b = users[1]!,
  stranger = users[2]!
let db: Awaited<ReturnType<typeof makeDatabase>>
function unwrap(result: RpcResponse) {
  expect(result.error).toBeUndefined()
  expect(result.state).toBeDefined()
  return result.state!
}
const create = async (user = a, id = randomUUID()) =>
  unwrap(await db.rpc(user, 'create_room', ['Player one', id]))
const join = async (room: RoomState, user = b) =>
  unwrap(await db.rpc(user, 'join_room', [room.code, 'Player two']))
const snapshot = async (room: RoomState, user = a) =>
  unwrap(await db.rpc(user, 'get_room', [room.roomId]))
const action = (room: RoomState, user: string, kind: string, payload = {}, id = randomUUID()) =>
  db.rpc(user, 'game_action', [room.roomId, room.game.id, room.game.turn, id, kind, payload])
async function playing() {
  let room = await create()
  room = await join(room)
  unwrap(await action(room, a, 'select', { characterId: 'amara' }))
  unwrap(await action(room, b, 'select', { characterId: 'milo' }))
  unwrap(await action(room, a, 'ready'))
  room = unwrap(await action(room, b, 'ready'))
  return room
}
async function ask(room: RoomState) {
  return unwrap(
    await action(room, room.game.activePlayer!, 'question', {
      text: 'Would they clap when the plane lands?',
    }),
  )
}
beforeAll(async () => {
  db = await makeDatabase()
  console.info(`Database test engine: ${db.transport}`)
})
beforeEach(async () => db.reset())
afterAll(async () => db?.close())

describe('rooms and authorization', () => {
  it('ships 24 matching ordered catalog entries and small local SVGs', async () => {
    const catalog = await db.admin.query('select id, name from public.characters order by position')
    expect(catalog.rows).toEqual(characters.map((c) => ({ id: c.id, name: c.name })))
    const sizes = await Promise.all(
      characters.map((c) =>
        stat(new URL(`../public${c.image}`, import.meta.url)).then((s) => s.size),
      ),
    )
    expect(sizes.reduce((sum, size) => sum + size, 0)).toBeLessThan(150000)
  })
  it('creates a room with safe code, lobby, and one member', async () => {
    const room = await create()
    expect(room.code).toMatch(/^[A-F0-9]{7}$/)
    expect(room.players).toHaveLength(1)
    expect(room.game.phase).toBe('lobby')
    expect(room.myCharacter).toBeNull()
    expect(room.reveals).toBeNull()
  })
  it('deduplicates simultaneous create retries using a request ID', async () => {
    const request = randomUUID(),
      rooms = await Promise.all([create(a, request), create(a, request)])
    expect(rooms[0]!.roomId).toBe(rooms[1]!.roomId)
    expect((await db.admin.query('select * from public.rooms')).rows).toHaveLength(1)
  })
  it('accepts lowercase invitation codes and reconnects an existing member', async () => {
    const room = await create()
    const joined = unwrap(await db.rpc(b, 'join_room', [` ${room.code.toLowerCase()} `, 'Friend']))
    expect(joined.players).toHaveLength(2)
    expect((await join(room)).players).toHaveLength(2)
  })
  it('admits exactly one of several simultaneous join requests', async () => {
    const room = await create()
    const responses = await Promise.all(
      users.slice(1, 8).map((user) => db.rpc(user, 'join_room', [room.code, 'Guest'])),
    )
    expect(responses.filter((r) => r.state)).toHaveLength(1)
    expect(responses.filter((r) => r.error?.includes('two players'))).toHaveLength(6)
    expect((await snapshot(room)).players).toHaveLength(2)
  })
  it('rejects invalid nicknames and counts failed joins for rate limiting', async () => {
    expect((await db.rpc(a, 'create_room', ['', randomUUID()])).error).toMatch(/nickname/)
    for (let i = 0; i < 20; i++)
      expect((await db.rpc(a, 'join_room', ['ZZZZZZZ', 'Name'])).error).toMatch(/code/)
    expect((await db.rpc(a, 'join_room', ['AAAAAAA', 'Name'])).error).toMatch(/Too many/)
  })
  it('limits room creation to five per hour', async () => {
    for (let i = 0; i < 5; i++) await create()
    expect((await db.rpc(a, 'create_room', ['Another', randomUUID()])).error).toMatch(/Too many/)
  })
  it('isolates rooms and rejects writes and anonymous RPC access', async () => {
    const room = await create()
    await create(stranger)
    expect((await db.as(a, (tx) => tx.query('select * from public.rooms'))).rows).toHaveLength(1)
    expect((await db.rpc(stranger, 'get_room', [room.roomId])).state).toBeUndefined()
    expect((await action(room, stranger, 'ready')).error).toMatch(/unavailable/)
    await expect(
      db.as(a, (tx) => tx.query("update public.rooms set code='AAAAAAA'")),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(db.rpc(null, 'create_room', ['No auth', randomUUID()])).rejects.toMatchObject({
      code: '42501',
    })
  })
})
describe('private selections and turns', () => {
  it('starts exactly one turn when both players ready simultaneously', async () => {
    let room = await create()
    room = await join(room)
    unwrap(await action(room, a, 'select', { characterId: 'amara' }))
    unwrap(await action(room, b, 'select', { characterId: 'milo' }))
    const ready = await Promise.all([action(room, a, 'ready'), action(room, b, 'ready')])
    expect(ready.every((result) => !result.error)).toBe(true)
    const started = await snapshot(room)
    expect(started.game.phase).toBe('question')
    expect(started.game.turn).toBe(1)
    expect(started.players.every((player) => player.ready)).toBe(true)
  })
  it('bounds action payloads and serializes competing question/guess commands', async () => {
    const room = await playing(),
      user = room.game.activePlayer!
    expect((await action(room, user, 'ready', { extra: 'x'.repeat(3000) })).error).toMatch(
      /too large/,
    )
    const commands = await Promise.all([
      action(room, user, 'question', { text: 'A questionable question?' }),
      action(room, user, 'guess', { characterId: user === a ? 'milo' : 'amara' }),
    ])
    expect(commands.filter((result) => !result.error)).toHaveLength(1)
    const current = await snapshot(room)
    expect(current.history).toHaveLength(current.game.phase === 'finished' ? 0 : 1)
    expect(['answer', 'finished']).toContain(current.game.phase)
  })
  it('requires a selection before ready and never leaks the opponent’s secret', async () => {
    let room = await create()
    room = await join(room)
    expect((await action(room, a, 'ready')).error).toMatch(/Pick/)
    unwrap(await action(room, a, 'select', { characterId: 'amara' }))
    const friend = await snapshot(room, b)
    expect(friend.myCharacter).toBeNull()
    expect(friend.reveals).toBeNull()
    expect(JSON.stringify(friend)).not.toContain('amara')
    await expect(
      db.as(a, (tx) => tx.query('select * from private.selections')),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      db.as(a, (tx) => tx.query('select private.snapshot($1)', [room.roomId])),
    ).rejects.toMatchObject({ code: '42501' })
    const broadcasts = (await db.admin.query('select payload from realtime.messages')).rows
    expect(broadcasts.every((row) => Object.keys(row.payload as object).join() === 'version')).toBe(
      true,
    )
  })
  it('rejects characters outside the pack and locks secrets after start', async () => {
    let room = await create()
    expect((await action(room, a, 'select', { characterId: 'unknown' })).error).toMatch(/board/)
    room = await playing()
    expect((await action(room, a, 'select', { characterId: 'cleo' })).error).toMatch(/locked/)
    expect((await action(room, a, 'unready')).error).toMatch(/started/)
  })
  it('randomly starts one of two players and enforces asking and answering roles', async () => {
    let room = await playing()
    expect([a, b]).toContain(room.game.activePlayer)
    expect(room.game.turn).toBe(1)
    expect(Date.parse(room.game.deadline!) - Date.parse(room.serverNow)).toBeGreaterThan(29000)
    const active = room.game.activePlayer!,
      other = active === a ? b : a
    expect((await action(room, other, 'question', { text: 'Hello?' })).error).toMatch(/turn/)
    room = await ask(room)
    expect(room.game.phase).toBe('answer')
    expect(room.history).toHaveLength(1)
    expect(Date.parse(room.game.deadline!) - Date.parse(room.serverNow)).toBeGreaterThan(14000)
    expect((await action(room, active, 'answer', { answer: true })).error).toMatch(/friend/)
    expect((await action(room, other, 'answer', { answer: 'YES' })).error).toMatch(/YES or NO/)
    room = unwrap(await action(room, other, 'answer', { answer: false }))
    expect(room.game.activePlayer).toBe(other)
    expect(room.game.turn).toBe(2)
    expect(room.game.phase).toBe('question')
    expect(room.history[0]!.answer).toBe(false)
  })
  it('validates 1–50 Unicode characters and immutable submitted questions', async () => {
    const room = await playing(),
      user = room.game.activePlayer!
    for (const text of ['', ' ', 'x'.repeat(51), 'Hello\nfriend'])
      expect((await action(room, user, 'question', { text })).error).toBeDefined()
    const asked = unwrap(await action(room, user, 'question', { text: '🤨'.repeat(50) }))
    expect(asked.history[0]!.text).toBe('🤨'.repeat(50))
    expect((await action(asked, user, 'question', { text: 'Changed?' })).error).toBeDefined()
    expect((await snapshot(room)).history[0]!.text).toBe('🤨'.repeat(50))
  })
  it('deduplicates rapid questions and rejects action ID reuse with different data', async () => {
    const room = await playing(),
      id = randomUUID(),
      user = room.game.activePlayer!
    const responses = await Promise.all(
      Array.from({ length: 5 }, () =>
        action(room, user, 'question', { text: 'Starts a podcast?' }, id),
      ),
    )
    expect(responses.every((r) => !r.error)).toBe(true)
    expect((await snapshot(room)).history).toHaveLength(1)
    expect((await action(room, user, 'question', { text: 'Different?' }, id)).error).toMatch(
      /already used/,
    )
  })
  it('advances an expired question without inventing a question', async () => {
    const room = await playing()
    await db.admin.query(
      "update public.games set deadline = clock_timestamp() - interval '1 second' where id=$1",
      [room.game.id],
    )
    const restored = await snapshot(room)
    expect(restored.game.turn).toBe(2)
    expect(restored.game.activePlayer).not.toBe(room.game.activePlayer)
    expect(restored.history).toHaveLength(0)
    expect(
      (await action(room, room.game.activePlayer!, 'question', { text: 'Too late?' })).error,
    ).toMatch(/turn has changed/)
  })
  it('marks an expired answer unanswered, keeping its value null', async () => {
    const room = await ask(await playing())
    await db.admin.query(
      "update public.games set deadline=clock_timestamp()-interval '1 second' where id=$1",
      [room.game.id],
    )
    const late = await action(room, room.game.activePlayer === a ? b : a, 'answer', {
      answer: true,
    })
    expect(late.error).toMatch(/turn has changed/)
    const restored = await snapshot(room)
    expect(restored.history[0]!.status).toBe('unanswered')
    expect(restored.history[0]!.answer).toBeNull()
    expect(restored.game.phase).toBe('question')
    expect(restored.game.turn).toBe(2)
  })
  it('reconciles long disconnections in one transition with the correct alternating player', async () => {
    const room = await playing()
    await db.admin.query(
      "update public.games set deadline=clock_timestamp()-interval '95 seconds' where id=$1",
      [room.game.id],
    )
    const restored = await snapshot(room)
    expect(restored.game.turn).toBe(5)
    expect(restored.game.activePlayer).toBe(room.game.activePlayer)
    expect(Date.parse(restored.game.deadline!) - Date.parse(restored.serverNow)).toBeGreaterThan(
      23000,
    )
    expect((await snapshot(room)).version).toBe(restored.version)
  })
  it('restores membership, secret, history, phase, and deadline after refresh', async () => {
    const room = await ask(await playing())
    const restored = await snapshot(room, a),
      rejoined = await join(room, a)
    expect(restored.myCharacter).toBe('amara')
    expect(rejoined.game).toEqual(restored.game)
    expect(restored.history).toEqual(room.history)
    expect(restored.game.deadline).toBe(room.game.deadline)
  })
})
describe('guessing, rematches, realtime, retention', () => {
  it.each([true, false])('resolves a %s final guess exclusively on the server', async (correct) => {
    const room = await playing(),
      active = room.game.activePlayer!,
      other = active === a ? b : a
    const target = correct ? (other === a ? 'amara' : 'milo') : 'cleo'
    const finished = unwrap(await action(room, active, 'guess', { characterId: target }))
    expect(finished.game.phase).toBe('finished')
    expect(finished.game.winner).toBe(correct ? active : other)
    expect(finished.reveals).toEqual({ [a]: 'amara', [b]: 'milo' })
    expect(finished.game.deadline).toBeNull()
    expect((await action(finished, active, 'guess', { characterId: target })).error).toMatch(
      /question turn/,
    )
  })
  it('blocks guesses from the wrong player and during the answer phase', async () => {
    let room = await playing()
    expect(
      (await action(room, room.game.activePlayer === a ? b : a, 'guess', { characterId: 'amara' }))
        .error,
    ).toBeDefined()
    room = await ask(room)
    expect(
      (await action(room, room.game.activePlayer!, 'guess', { characterId: 'amara' })).error,
    ).toBeDefined()
  })
  it('requires two rematch votes, keeps membership, and clears all round state', async () => {
    const room = await playing(),
      active = room.game.activePlayer!
    const finished = unwrap(await action(room, active, 'guess', { characterId: 'cleo' }))
    const voted = unwrap(await action(finished, a, 'rematch'))
    expect(voted.game.phase).toBe('finished')
    expect(voted.players.find((p) => p.id === a)!.rematchReady).toBe(true)
    const next = unwrap(await action(finished, b, 'rematch'))
    expect(next.roomId).toBe(room.roomId)
    expect(next.code).toBe(room.code)
    expect(next.players).toHaveLength(2)
    expect(next.game.id).not.toBe(room.game.id)
    expect(next.game.phase).toBe('lobby')
    expect(next.myCharacter).toBeNull()
    expect(next.reveals).toBeNull()
    expect(next.history).toHaveLength(0)
    expect(next.players.every((p) => !p.ready && !p.rematchReady)).toBe(true)
    expect((await action(finished, a, 'guess', { characterId: 'milo' })).error).toMatch(/new round/)
  })
  it('authorizes private realtime topics by membership and makes game topics receive-only', async () => {
    const room = await create()
    const send = (user: string, topic: string) =>
      db.as(
        user,
        (tx) =>
          tx.query(
            "insert into realtime.messages(topic, extension, payload) values ($1,'broadcast','{}')",
            [topic],
          ),
        topic,
      )
    await send(a, `social:${room.roomId}`)
    await expect(send(a, `game:${room.roomId}`)).rejects.toMatchObject({ code: '42501' })
    await expect(send(stranger, `social:${room.roomId}`)).rejects.toMatchObject({ code: '42501' })
    await expect(send(a, 'social:invalid')).rejects.toMatchObject({ code: '42501' })
    expect(
      (
        await db.as(
          stranger,
          (tx) => tx.query('select * from realtime.messages'),
          `social:${room.roomId}`,
        )
      ).rows,
    ).toHaveLength(0)
    expect(
      (await db.as(a, (tx) => tx.query('select * from realtime.messages'), `social:${room.roomId}`))
        .rows.length,
    ).toBeGreaterThan(0)
  })
  it('expires inactive rooms and cleans their dependent secrets and receipts', async () => {
    const room = await playing()
    await db.admin.query(
      "update public.rooms set last_activity=clock_timestamp()-interval '25 hours' where id=$1",
      [room.roomId],
    )
    const expired = await db.rpc(a, 'get_room', [room.roomId])
    expect(expired.error).toBeDefined()
    expect((expired as RpcResponse & { code?: string }).code).toBe('ROOM_UNAVAILABLE')
    expect((await db.rpc(stranger, 'join_room', [room.code, 'Late'])).error).toMatch(/expired/)
    await expect(
      db.as(a, (tx) => tx.query('select public.cleanup_expired_rooms()')),
    ).rejects.toMatchObject({ code: '42501' })
    await db.admin.query('select public.cleanup_expired_rooms()')
    expect((await db.admin.query('select * from private.selections')).rows).toHaveLength(0)
    expect((await db.admin.query('select * from public.rooms')).rows).toHaveLength(0)
  })
  it('does not revive an expired room by replaying its creation ID', async () => {
    const id = randomUUID(),
      room = await create(a, id)
    await db.admin.query(
      "update public.rooms set last_activity=clock_timestamp()-interval '25 hours' where id=$1",
      [room.roomId],
    )
    expect((await db.rpc(a, 'create_room', ['Player one', id])).error).toMatch(/expired/)
  })
})
