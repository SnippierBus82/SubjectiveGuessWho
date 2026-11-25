import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID } from 'node:crypto'
import { makeDatabase, users, prepareTestBoard, type RpcResponse } from './support/database'
import { AI_BOARD } from '../src/game/board-model'
import { DEFAULT_TIMINGS } from '../src/game/timings'
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
  unwrap(await db.rpc(user, 'create_room_board_v2', ['Player one', id, DEFAULT_TIMINGS, AI_BOARD]))
const join = async (room: RoomState, user = b) =>
  unwrap(await db.rpc(user, 'join_room_v2', [room.code, 'Player two']))
const snapshot = async (room: RoomState, user = a) =>
  unwrap(await db.rpc(user, 'get_room_v2', [room.roomId]))
const action = (room: RoomState, user: string, kind: string, payload = {}, id = randomUUID()) =>
  db.rpc(user, 'game_action_v2', [room.roomId, room.game.id, room.game.turn, id, kind, payload])
async function playing() {
  let room = await create()
  room = await join(room)
  room = await prepareTestBoard(db, a, room)
  unwrap(await action(room, a, 'select', { characterId: 'p01' }))
  unwrap(await action(room, b, 'select', { characterId: 'p02' }))
  unwrap(await action(room, a, 'ready'))
  room = unwrap(await action(room, b, 'ready'))
  return room
}
beforeAll(async () => {
  db = await makeDatabase()
})
beforeEach(async () => db.reset())
afterAll(async () => db?.close())

describe('rooms and authorization', () => {
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
    const joined = unwrap(
      await db.rpc(b, 'join_room_v2', [` ${room.code.toLowerCase()} `, 'Friend']),
    )
    expect(joined.players).toHaveLength(2)
    expect((await join(room)).players).toHaveLength(2)
  })
  it('admits exactly one of several simultaneous join requests', async () => {
    const room = await create()
    const responses = await Promise.all(
      users.slice(1, 8).map((user) => db.rpc(user, 'join_room_v2', [room.code, 'Guest'])),
    )
    expect(responses.filter((r) => r.state)).toHaveLength(1)
    expect(responses.filter((r) => r.error?.includes('two players'))).toHaveLength(6)
    expect((await snapshot(room)).players).toHaveLength(2)
  })
  it('rejects invalid nicknames and counts failed joins for rate limiting', async () => {
    expect(
      (await db.rpc(a, 'create_room_board_v2', ['', randomUUID(), DEFAULT_TIMINGS, AI_BOARD]))
        .error,
    ).toMatch(/nickname/)
    for (let i = 0; i < 10; i++)
      expect((await db.rpc(a, 'join_room_v2', ['0000000', 'Name'])).error).toMatch(
        /expired or does not exist/,
      )
    expect((await db.rpc(a, 'join_room_v2', ['AAAAAAA', 'Name'])).error).toMatch(/Too many/)
  })
  it('limits room creation to twenty per hour', async () => {
    for (let i = 0; i < 20; i++) unwrap(await action(await create(), a, 'leave'))
    expect(
      (
        await db.rpc(a, 'create_room_board_v2', [
          'Another',
          randomUUID(),
          DEFAULT_TIMINGS,
          AI_BOARD,
        ])
      ).error,
    ).toMatch(/Too many/)
  })
  it('isolates rooms and rejects writes and anonymous RPC access', async () => {
    const room = await create()
    await create(stranger)
    expect((await db.as(a, (tx) => tx.query('select * from public.rooms'))).rows).toHaveLength(1)
    expect((await db.rpc(stranger, 'get_room_v2', [room.roomId])).state).toBeUndefined()
    expect((await action(room, stranger, 'ready')).error).toMatch(/unavailable/)
    await expect(
      db.as(a, (tx) => tx.query("update public.rooms set code='AAAAAAA'")),
    ).rejects.toMatchObject({ code: '42501' })
    await expect(
      db.rpc(null, 'create_room_board_v2', ['No auth', randomUUID(), DEFAULT_TIMINGS, AI_BOARD]),
    ).rejects.toMatchObject({
      code: '42501',
    })
  })
})
describe('realtime and retention', () => {
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
    await expect(send(a, `social:${room.roomId}`)).rejects.toMatchObject({ code: '42501' })
    await db.rpc(a, 'send_reaction_v2', [room.roomId, randomUUID(), '\u{1F602}'])
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
    const expired = await db.rpc(a, 'get_room_v2', [room.roomId])
    expect(expired.error).toBeDefined()
    expect(expired.code).toBe('ROOM_UNAVAILABLE')
    expect((await db.rpc(stranger, 'join_room_v2', [room.code, 'Late'])).error).toMatch(/expired/)
    await expect(
      db.as(a, (tx) => tx.query('select public.cleanup_expired_rooms()')),
    ).rejects.toMatchObject({ code: '42501' })
    await db.admin.query('select public.cleanup_expired_rooms()')
    expect((await db.admin.query('select * from private.selections')).rows).toHaveLength(0)
    expect((await db.admin.query('select * from public.rooms')).rows).toHaveLength(0)
  })
  it('refreshes room retention on a heartbeat close to the idle limit', async () => {
    const room = await create()
    await db.admin.query(
      "update public.rooms set last_activity=clock_timestamp()-interval '23 hours 59 minutes' where id=$1",
      [room.roomId],
    )
    expect(
      (await db.rpc(a, 'heartbeat_room_v2', [room.roomId, room.version])).error,
    ).toBeUndefined()
    const updated = await db.admin.query(
      "select last_activity > clock_timestamp()-interval '1 minute' as refreshed from public.rooms where id=$1",
      [room.roomId],
    )
    expect(updated.rows[0]?.refreshed).toBe(true)
    await db.admin.query('select public.cleanup_expired_rooms()')
    expect((await snapshot(room)).roomId).toBe(room.roomId)
  })
  it('does not revive an expired room by replaying its creation ID', async () => {
    const id = randomUUID(),
      room = await create(a, id)
    await db.admin.query(
      "update public.rooms set last_activity=clock_timestamp()-interval '25 hours' where id=$1",
      [room.roomId],
    )
    expect(
      (await db.rpc(a, 'create_room_board_v2', ['Player one', id, DEFAULT_TIMINGS, AI_BOARD]))
        .error,
    ).toMatch(/expired/)
  })
})
