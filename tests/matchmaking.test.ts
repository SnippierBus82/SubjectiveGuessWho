import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { makeDatabase, users, type RpcResponse } from './support/database'
import type { MatchStatus } from '../src/game/types'

const a = users[0]!,
  b = users[1]!,
  c = users[2]!,
  d = users[3]!
let db: Awaited<ReturnType<typeof makeDatabase>>
const match = (user: string, board: string, command = 'join') =>
  db.rpc(user, 'matchmake_board_v2', ['Player', command, board]) as Promise<
    RpcResponse & MatchStatus
  >

beforeAll(async () => {
  db = await makeDatabase()
  await db.admin.query("select public.register_board_v3('folder/Animals','Animals','1','folder')")
  await db.admin.query("select public.register_board_v3('folder/People','People','1','folder')")
})
beforeEach(async () => db.reset())
afterAll(async () => db?.close())

describe('matching board preferences', () => {
  it('pairs only matching preferences, including concurrent admissions', async () => {
    await Promise.all([
      match(a, 'folder/Animals'),
      match(b, 'folder/People'),
      match(c, 'folder/Animals'),
      match(d, 'folder/People'),
    ])
    const rooms = await db.admin.query(
      'select r.id,r.board_id,array_agg(p.user_id::text order by p.user_id) as players from public.rooms r join public.room_players p on p.room_id=r.id group by r.id,r.board_id order by r.board_id',
    )
    expect(rooms.rows).toHaveLength(2)
    expect(rooms.rows.find((row) => row.board_id === 'folder/Animals')!.players).toEqual([a, c])
    expect(rooms.rows.find((row) => row.board_id === 'folder/People')!.players).toEqual([b, d])
  })
  it('keeps the chosen board on pulses and resets FIFO position when switching boards', async () => {
    await match(a, 'folder/People')
    await db.admin.query(
      "update private.match_queue set queued_at=clock_timestamp()-interval '20 seconds' where user_id=$1",
      [a],
    )
    const before = await db.admin.query(
      'select queued_at from private.match_queue where user_id=$1',
      [a],
    )
    expect((await match(a, 'ai-random', 'pulse')).boardId).toBe('folder/People')
    expect((await match(a, 'ai-random')).boardId).toBe('ai-random')
    const after = await db.admin.query(
      'select queued_at from private.match_queue where user_id=$1',
      [a],
    )
    expect(new Date(after.rows[0]!.queued_at as string).getTime()).toBeGreaterThan(
      new Date(before.rows[0]!.queued_at as string).getTime(),
    )
    expect((await match(b, 'ai-random')).status).toBe('matched')
  })
  it('gives the oldest eligible player priority within the selected board', async () => {
    await db.admin.query(
      "insert into private.match_queue(user_id,nickname,board_id,queued_at) values($1,'Different','ai-random',clock_timestamp()-interval '25 seconds'),($2,'Older','folder/People',clock_timestamp()-interval '20 seconds'),($3,'Newer','folder/People',clock_timestamp()-interval '10 seconds')",
      [a, b, c],
    )
    const m = await match(d, 'folder/People')
    const joined = (await db.rpc(d, 'get_room_v2', [m.roomId])).state!
    expect(joined.players.map((p) => p.id)).toEqual([b, d])
    expect(joined.boardId).toBe('folder/People')
  })
})
