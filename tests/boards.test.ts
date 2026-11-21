import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest'
import { randomUUID, createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { makeDatabase, users, type RpcResponse } from './support/database'
import { boardFor, BOARDS, type BoardId } from '../src/game/legacy/boards'
import pool from '../src/game/legacy/face-pool.json'
import { DEFAULT_TIMINGS } from '../src/game/timings'
import type { MatchStatus, RoomState } from '../src/game/types'

let db: Awaited<ReturnType<typeof makeDatabase>>
const [a, b, c, d] = users as [string, string, string, string, ...string[]]
const state = (response: RpcResponse) => {
  expect(response.error).toBeUndefined()
  return response.state!
}
const create = async (board: BoardId, request = randomUUID()) =>
  state(await db.rpc(a, 'create_room_board_v2', ['Alice', request, DEFAULT_TIMINGS, board]))
const action = async (s: RoomState, user: string, kind: string, payload = {}) =>
  state(
    await db.rpc(user, 'game_action_v2', [
      s.roomId,
      s.game.id,
      s.game.turn,
      randomUUID(),
      kind,
      payload,
    ]),
  )
const match = (user: string, board: BoardId, command = 'join') =>
  db.rpc(user, 'matchmake_board_v2', ['Player', command, board]) as Promise<
    RpcResponse & MatchStatus
  >
beforeAll(async () => {
  db = await makeDatabase()
})
beforeEach(async () => { await db.reset(); await db.admin.query("update private.board_catalog set enabled=true where not managed") })
afterAll(async () => db?.close())

describe('selectable game boards', () => {
  it.each(BOARDS.map((board) => board.id))(
    'saves %s for both players and preserves it through rematches',
    async (boardId) => {
      let s = await create(boardId)
      expect(s.boardId).toBe(boardId)
      expect(s.game.packId).toBe(boardId)
      const first = s.board
      expect(first).toHaveLength(24)
      const joined = state(await db.rpc(b, 'join_room_v2', [s.code, 'Bob']))
      expect(joined.board).toEqual(first)
      s = await action(joined, a, 'leave')
      await action(s, a, 'rematch')
      s = await action(s, b, 'rematch')
      expect(s.game.phase).toBe('lobby')
      expect(s.boardId).toBe(boardId)
      expect(s.board).toHaveLength(24)
      if (boardId === 'million-faces-v1') expect(s.board).toEqual(first)
      else expect(s.board).not.toEqual(first)
    },
  )
  it.each([0, 1, 8426, 2147483646])(
    'browser and SQL choose the same shuffled faces for seed %s',
    async (seed) => {
      const s = await create('million-faces-shuffle-v1')
      await db.admin.query('delete from public.game_characters where game_id=$1', [s.game.id])
      await db.admin.query('select private.generate_cast($1,$2)', [s.game.id, seed])
      const saved = state(await db.rpc(a, 'get_room_v2', [s.roomId]))
      expect(saved.board).toEqual(boardFor('million-faces-shuffle-v1', seed))
      expect(new Set(saved.board!.map((face) => face.id)).size).toBe(24)
    },
  )
  it('validates face IDs against the saved photographic board and keeps the secret private', async () => {
    let s = await create('million-faces-shuffle-v1')
    s = state(await db.rpc(b, 'join_room_v2', [s.code, 'Bob']))
    const [first, second] = s.board!
    await action(s, a, 'select', { characterId: first!.id })
    await action(s, b, 'select', { characterId: second!.id })
    await action(s, a, 'ready')
    s = await action(s, b, 'ready')
    expect(s.myCharacter).toBe(second!.id)
    expect(s.reveals).toBeNull()
    const rejected = await db.rpc(a, 'game_action_v2', [
      s.roomId,
      s.game.id,
      s.game.turn,
      randomUUID(),
      'select',
      { characterId: 'p01' },
    ])
    expect(rejected.error).toBeDefined()
    const writer = s.game.activePlayer!
    const target = writer === a ? second! : first!
    s = await action(s, writer, 'guess', { characterId: target.id })
    expect(s.game.result).toBe('correct')
    expect(s.reveals).toEqual({ [a]: first!.id, [b]: second!.id })
    expect((await db.rpc(c, 'get_room_v2', [s.roomId])).error).toBeDefined()
  })
  it('binds creation retries to the board choice, validates IDs, and preserves old clients', async () => {
    for (const invalid of [null, 'paid-board', '../bad'])
      expect(
        (await db.rpc(a, 'create_room_board_v2', ['Alice', randomUUID(), DEFAULT_TIMINGS, invalid]))
          .error,
      ).toMatch(/available board/)
    const request = randomUUID()
    const s = await create('million-faces-v1', request)
    expect((await create('million-faces-v1', request)).roomId).toBe(s.roomId)
    expect(
      (await db.rpc(a, 'create_room_board_v2', ['Alice', request, DEFAULT_TIMINGS, 'generated-v1']))
        .error,
    ).toMatch(/request ID/)
    await action(s, a, 'leave')
    const legacy = state(
      await db.rpc(a, 'create_room_v2', ['Alice', randomUUID(), DEFAULT_TIMINGS]),
    )
    expect(legacy.boardId).toBe('generated-v1')
    expect(legacy.board![0]!.traits).toBeDefined()
    await expect(
      db.rpc(null, 'create_room_board_v2', [
        'Anon',
        randomUUID(),
        DEFAULT_TIMINGS,
        'million-faces-v1',
      ]),
    ).rejects.toThrow()
    await expect(
      db.as(a, (q) => q.query("update public.rooms set board_id='million-faces-v1'")),
    ).rejects.toThrow()
    await expect(db.as(a, (q) => q.query('select * from private.board_faces'))).rejects.toThrow()
  })
  it('keeps copied boards intact if a source pack is disabled', async () => {
    const s = await create('million-faces-v1')
    await match(b, 'million-faces-v1')
    await db.admin.query(
      "update private.board_catalog set enabled=false where id='million-faces-v1'",
    )
    try {
      expect(
        (
          await db.rpc(b, 'create_room_board_v2', [
            'Bob',
            randomUUID(),
            DEFAULT_TIMINGS,
            'million-faces-v1',
          ])
        ).error,
      ).toMatch(/available/)
      expect((await match(b, 'generated-v1', 'pulse')).error).toMatch(/unavailable/)
      expect(state(await db.rpc(b, 'join_room_v2', [s.code, 'Bob'])).board).toEqual(s.board)
    } finally {
      await db.admin.query('update private.board_catalog set enabled=true')
    }
  })
  it('ships verifiable images and explicit provenance without invented dataset annotations', async () => {
    const manifest = JSON.parse(
      await readFile(
        new URL('../artwork/one-million-faces/manifest.json', import.meta.url),
        'utf8',
      ),
    )
    expect(manifest.synthetic).toBe(true)
    expect(manifest.revision).toMatch(/^[a-f0-9]{40}$/)
    expect(pool).toHaveLength(144)
    expect(new Set(pool.map((face) => face.name)).size).toBe(144)
    expect(manifest.faces.map((entry: { character: unknown }) => entry.character)).toEqual(pool)
    for (const entry of manifest.faces) {
      const bytes = await readFile(new URL(`../public/ai-face-cache/${entry.character.image.split('/').at(-1)}`, import.meta.url))
      expect(createHash('sha256').update(bytes).digest('hex')).toBe(entry.image.sha256)
      expect(entry.observedTraits).toBeNull()
    }
    const sqlPool = await db.admin.query(
      'select definition from private.board_faces order by position',
    )
    expect(sqlPool.rows.map((row) => row.definition)).toEqual(pool)
  })
})

describe('matching board preferences', () => {
  it('pairs only matching preferences, including concurrent admissions', async () => {
    await Promise.all([
      match(a, 'million-faces-shuffle-v1'),
      match(b, 'million-faces-v1'),
      match(c, 'million-faces-shuffle-v1'),
      match(d, 'million-faces-v1'),
    ])
    const rooms = await db.admin.query(
      'select r.id,r.board_id,array_agg(p.user_id::text order by p.user_id) as players from public.rooms r join public.room_players p on p.room_id=r.id group by r.id,r.board_id order by r.board_id',
    )
    expect(rooms.rows).toHaveLength(2)
    expect(rooms.rows.find((row) => row.board_id === 'million-faces-shuffle-v1')!.players).toEqual([
      a,
      c,
    ])
    expect(rooms.rows.find((row) => row.board_id === 'million-faces-v1')!.players).toEqual([b, d])
  })
  it('keeps the chosen board on pulses and resets FIFO position when switching boards', async () => {
    await match(a, 'million-faces-v1')
    await db.admin.query(
      "update private.match_queue set queued_at=clock_timestamp()-interval '20 seconds' where user_id=$1",
      [a],
    )
    const before = await db.admin.query(
      'select queued_at from private.match_queue where user_id=$1',
      [a],
    )
    expect((await match(a, 'generated-v1', 'pulse')).boardId).toBe('million-faces-v1')
    expect((await match(a, 'generated-v1')).boardId).toBe('generated-v1')
    const after = await db.admin.query(
      'select queued_at from private.match_queue where user_id=$1',
      [a],
    )
    expect(new Date(after.rows[0]!.queued_at as string).getTime()).toBeGreaterThan(
      new Date(before.rows[0]!.queued_at as string).getTime(),
    )
    expect(
      ((await db.rpc(b, 'matchmake_v2', ['Old client', 'join'])) as RpcResponse & MatchStatus)
        .status,
    ).toBe('matched')
  })
  it('gives the oldest eligible player priority within the selected board', async () => {
    await db.admin.query(
      "insert into private.match_queue(user_id,nickname,board_id,queued_at) values($1,'Different','generated-v1',clock_timestamp()-interval '25 seconds'),($2,'Older','million-faces-v1',clock_timestamp()-interval '20 seconds'),($3,'Newer','million-faces-v1',clock_timestamp()-interval '10 seconds')",
      [a, b, c],
    )
    const m = await match(d, 'million-faces-v1')
    const joined = state(await db.rpc(d, 'get_room_v2', [m.roomId]))
    expect(joined.players.map((p) => p.id)).toEqual([b, d])
    expect(joined.boardId).toBe('million-faces-v1')
  })
})
