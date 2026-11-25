import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, mkdir, writeFile, rm, rmdir, copyFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import sharp from 'sharp'
import { randomUUID } from 'node:crypto'
import { createServer } from 'node:http'
import type { AddressInfo } from 'node:net'
import type { SupabaseClient } from '@supabase/supabase-js'
import { discoverBoards } from '../server/catalog'
import { onlineFaces, resolveBoard, SourceUnavailable, type OnlineFace } from '../server/faces'
import { prepareBoard } from '../server/board-service'
import { boardHttp } from '../server/board-http'
import { AI_BOARD, sample, type BoardCatalog } from '../src/game/board-model'
import names from '../src/game/neutral-names.json' with { type: 'json' }
import { DEFAULT_TIMINGS } from '../src/game/timings'
import { makeDatabase, users, type RpcResponse } from './support/database'

const cache = Array.from({ length: 30 }, (_, i) => ({
  id: `cache-${i}`,
  image: `/fallback-faces/${i}.webp`,
}))
const folder = {
  id: 'folder/Friends',
  name: 'Friends',
  kind: 'folder' as const,
  version: 'test',
  characters: Array.from({ length: 30 }, (_, i) => ({
    id: `person-${i}`,
    name: `Person ${i}`,
    image: `/boards/Friends/Person%20${i}.webp`,
  })),
}
const catalog: BoardCatalog = { boards: [folder], cache }
describe('folder discovery and face sources', () => {
  let root: string
  beforeAll(async () => {
    root = await mkdtemp(join(tmpdir(), 'sgw-boards-'))
    await mkdir(join(root, 'public/boards/Friends'), { recursive: true })
    await mkdir(join(root, 'public/fallback-faces'), { recursive: true })
    for (let i = 0; i < 24; i++) {
      await writeFile(
        join(root, `public/boards/Friends/Person ${i}.svg`),
        `<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><rect width="24" height="24" fill="rgb(${i},80,120)"/></svg>`,
      )
      await writeFile(join(root, `public/fallback-faces/seed${i}.webp`), 'fixture')
    }
  })
  afterAll(async () => {
    const base = resolve(tmpdir())
    if (!root || !resolve(root).startsWith(join(base, 'sgw-boards-')))
      throw new Error('Unexpected fixture path')
    await rm(root, { recursive: true, force: true })
  })
  it('discovers filenames without any names file, including spaces and Unicode', async () => {
    await writeFile(
      join(root, 'public/boards/Friends/Zoë & Alex.svg'),
      '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24"><circle r="11" cx="12" cy="12"/></svg>',
    )
    const result = await discoverBoards(root)
    expect(result.boards).toHaveLength(1)
    expect(result.boards[0]!.characters).toHaveLength(25)
    expect(result.boards[0]!.characters.find((c) => c.name === 'Zoë & Alex')!.image).toContain(
      'Zo%C3%AB%20%26%20Alex.svg',
    )
    const selected = sample(result.boards[0]!.characters, 24)
    expect(new Set(selected.map((c) => c.id)).size).toBe(24)
  })
  it('reports incomplete boards and rejects duplicate names and byte-identical images', async () => {
    const incomplete = join(root, 'public/boards/Incomplete')
    await mkdir(incomplete)
    await expect(discoverBoards(root)).rejects.toThrow(/Incomplete.*0\/24/)
    expect((await discoverBoards(root, false)).boards).toHaveLength(1)
    await rmdir(incomplete)
    const duplicate = join(root, 'public/boards/Friends/Person 0.png')
    await copyFile(join(root, 'public/boards/Friends/Person 0.svg'), duplicate)
    await expect(discoverBoards(root)).rejects.toThrow(/Duplicate character name/)
    await rm(duplicate)
    const copy = join(root, 'public/boards/Friends/Copy.svg')
    await copyFile(join(root, 'public/boards/Friends/Person 0.svg'), copy)
    await expect(discoverBoards(root)).rejects.toThrow(/Duplicate image/)
    await rm(copy)
  })
  it('has one list of unique neutral names and samples without replacement', () => {
    expect(names.length).toBeGreaterThanOrEqual(24)
    expect(new Set(names.map((name) => name.toLowerCase())).size).toBe(names.length)
    expect(new Set(sample(names, 24)).size).toBe(24)
  })
  it('never contacts the online source for a folder board', async () => {
    const acquire = vi.fn().mockRejectedValue(new Error('Should not run'))
    const result = await resolveBoard(catalog, folder.id, acquire)
    expect(result.source).toBe('folder')
    expect(result.characters).toHaveLength(24)
    expect(acquire).not.toHaveBeenCalled()
  })
  it('uses online faces first, without reading the fallback pool', async () => {
    const uploads: OnlineFace[] = Array.from({ length: 24 }, (_, i) => ({
      id: `online-${i}`,
      bytes: Buffer.from('fixture'),
      source: 'test',
    }))
    const noCache = {
      boards: [],
      get cache(): BoardCatalog['cache'] {
        throw new Error('Fallback was touched')
      },
    }
    const result = await resolveBoard(noCache, AI_BOARD, async () => uploads)
    expect(result.source).toBe('online')
    expect(result.uploads).toEqual(uploads)
    expect(new Set(result.characters.map((c) => c.name)).size).toBe(24)
  })
  it('falls back only for source outages and keeps names unique in a whole cached board', async () => {
    const result = await resolveBoard(catalog, AI_BOARD, async () => {
      throw new SourceUnavailable('Down')
    })
    expect(result.source).toBe('cache')
    expect(result.characters).toHaveLength(24)
    expect(new Set(result.characters.map((c) => c.name)).size).toBe(24)
    await expect(
      resolveBoard(catalog, AI_BOARD, async () => {
        throw new Error('Configuration failure')
      }),
    ).rejects.toThrow(/Configuration/)
  })
  it('decodes provider JPEGs with generic binary headers and optimizes them', async () => {
    const images = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        sharp({
          create: { width: 32, height: 32, channels: 3, background: { r: i * 7, g: 90, b: 130 } },
        })
          .jpeg()
          .toBuffer(),
      ),
    )
    images.push(
      Buffer.from(
        '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32"><rect width="32" height="32" fill="red"/></svg>',
      ),
    )
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/rows')
        return Response.json({
          num_rows_total: images.length,
          rows: images.map((_, i) => ({
            row: {
              png: { src: `https://datasets-server.huggingface.co/image/${i}` },
              __key__: `seed${i}`,
            },
          })),
        })
      const index = Number(url.pathname.split('/').at(-1))
      return new Response(images[index]!, {
        headers: { 'content-type': index % 2 ? 'application/octet-stream' : 'binary/octet-stream' },
      })
    }
    const result = await onlineFaces(fetcher)
    expect(result).toHaveLength(24)
    expect(new Set(result.map((face) => face.id)).size).toBe(24)
    expect(result.every((face) => !face.source.endsWith('#seed24'))).toBe(true)
    expect((await sharp(result[0]!.bytes).metadata()).format).toBe('webp')
  })
  it('treats provider failures and the acquisition deadline as an outage', async () => {
    await expect(
      onlineFaces(async () => new Response('down', { status: 503 })),
    ).rejects.toBeInstanceOf(SourceUnavailable)
    const stalled: typeof fetch = async (_input, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener('abort', () => reject(new Error('timeout'))),
      )
    await expect(onlineFaces(stalled, 15)).rejects.toBeInstanceOf(SourceUnavailable)
  })
  it('tries an accessible online slice before using cache when the viewer export is partial', async () => {
    const images = await Promise.all(
      Array.from({ length: 24 }, (_, i) =>
        sharp({
          create: { width: 16, height: 16, channels: 3, background: { r: i * 8, g: 30, b: 90 } },
        })
          .png()
          .toBuffer(),
      ),
    )
    let calls = 0
    const fetcher: typeof fetch = async (input) => {
      const url = new URL(String(input))
      if (url.pathname === '/rows') {
        calls++
        if (calls === 2) return new Response('Slice unavailable', { status: 422 })
        return Response.json({
          num_rows_total: 10000,
          partial: true,
          rows: images.map((_, i) => ({
            row: { png: { src: `https://datasets-server.huggingface.co/image/${i}` } },
          })),
        })
      }
      return new Response(images[Number(url.pathname.split('/').at(-1))]!, {
        headers: { 'content-type': 'image/png' },
      })
    }
    // Make the sampled offset nonzero without changing the acquisition code.
    const spy = vi.spyOn(crypto, 'getRandomValues').mockImplementation((array) => {
      ;(array as Uint32Array)[0] = 2147483648
      return array
    })
    try {
      expect(await onlineFaces(fetcher)).toHaveLength(24)
      expect(calls).toBe(3)
    } finally {
      spy.mockRestore()
    }
  })
  it('does not turn a storage failure into a cached board', async () => {
    const rpc = vi.fn(async (name: string) => ({
      data: name === 'claim_board_v3' ? { status: 'claimed', boardId: AI_BOARD } : null,
      error: null,
    }))
    const client = {
      rpc,
      storage: {
        from: () => ({ upload: async () => ({ error: { message: 'Storage unavailable' } }) }),
      },
    } as unknown as SupabaseClient
    const resolver = vi.fn(async () => ({
      source: 'online' as const,
      characters: [{ id: 'face', name: 'Alex', image: '' }],
      uploads: [{ id: 'face', bytes: Buffer.from('x'), source: 'test' }],
    }))
    await expect(
      prepareBoard(client, catalog, 'actor', randomUUID(), randomUUID(), resolver),
    ).rejects.toThrow(/save the selected/)
    expect(resolver).toHaveBeenCalledTimes(1)
    expect(rpc.mock.calls.some(([name]) => name === 'fail_board_v3')).toBe(true)
  })
  it.each(['/fallback-faces/', '/ai-face-cache/'])(
    'finalizes the outage fallback when the database accepts %s',
    async (acceptedPrefix) => {
      const writes: string[][] = []
      const leases: unknown[] = []
      const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
        if (name === 'claim_board_v3')
          return { data: { status: 'claimed', boardId: AI_BOARD }, error: null }
        if (name !== 'finish_board_v3') throw new Error(`Unexpected RPC: ${name}`)
        expect(args.p_source).toBe('cache')
        leases.push(args.p_lease)
        const images = (args.p_characters as { image: string }[]).map((face) => face.image)
        writes.push(images)
        return images.every((image) => image.startsWith(acceptedPrefix))
          ? { data: true, error: null }
          : { data: null, error: { code: 'P0001', message: 'Invalid character' } }
      })
      const client = { rpc } as unknown as SupabaseClient
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
      try {
        const prepare = prepareBoard(
          client,
          catalog,
          'actor',
          randomUUID(),
          randomUUID(),
          (data, id) =>
            resolveBoard(data, id, () =>
              onlineFaces(async () => new Response(null, { status: 503 })),
            ),
        )
        await expect(prepare).resolves.toBe('ready')
        expect(writes[0]).toHaveLength(24)
        expect(writes[0]!.every((image) => image.startsWith('/fallback-faces/'))).toBe(true)
        expect(writes).toHaveLength(acceptedPrefix === '/ai-face-cache/' ? 2 : 1)
        expect(writes.at(-1)).toEqual(
          writes[0]!.map((image) => image.replace('/fallback-faces/', acceptedPrefix)),
        )
        expect(new Set(leases).size).toBe(1)
      } finally {
        warn.mockRestore()
      }
    },
  )
  it('protects the HTTP endpoint and never enables unauthenticated preview in production', async () => {
    const server = createServer(
      (request, response) => void boardHttp(request, response, catalog, {}),
    )
    await new Promise<void>((done) => server.listen(0, '127.0.0.1', done))
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`
    try {
      expect((await fetch(url)).status).toBe(405)
      const result = await fetch(url, {
        method: 'POST',
        body: JSON.stringify({ operation: 'preview', boardId: AI_BOARD }),
      })
      expect(result.status).toBe(401)
      expect((await result.json()).error).toMatch(/Reconnect/)
      const missing = await fetch(url, {
        method: 'POST',
        headers: { Authorization: 'Bearer test' },
        body: JSON.stringify({ operation: 'register', boardId: AI_BOARD }),
      })
      const message = (await missing.json()).error
      expect(message).toContain('SUPABASE_SECRET_KEY')
      expect(message).toContain('.env.local')
      expect(message).toContain('restart Vite')
      expect(message).toContain('Vercel')
      expect(message).toContain('redeploy')
      expect(message).toContain('Settings > API Keys')
      expect(message).not.toMatch(/sb_secret_|Bearer test/)
    } finally {
      await new Promise<void>((done) => server.close(() => done()))
    }
  })
  it('saves online bytes before finalizing, and reuses an already-prepared game', async () => {
    const events: string[] = [],
      upload = vi.fn(async () => {
        events.push('upload')
        return { error: null }
      })
    const rpc = vi.fn(async (name: string, args?: Record<string, unknown>) => {
      if (name === 'claim_board_v3')
        return { data: { status: 'claimed', boardId: AI_BOARD }, error: null }
      if (name === 'finish_board_v3') {
        events.push('finish')
        expect((args!.p_characters as { image: string }[])[0]!.image).toContain(
          '/storage/v1/object/public/game-faces/',
        )
      }
      return { data: true, error: null }
    })
    const client = {
      rpc,
      storage: {
        from: () => ({
          upload,
          getPublicUrl: (path: string) => ({
            data: {
              publicUrl: `https://test.supabase.co/storage/v1/object/public/game-faces/${path}`,
            },
          }),
        }),
      },
    } as unknown as SupabaseClient
    const resolver = vi.fn(async () => ({
      source: 'online' as const,
      characters: [{ id: 'face', name: 'Alex', image: '' }],
      uploads: [{ id: 'face', bytes: Buffer.from('x'), source: 'test' }],
    }))
    expect(await prepareBoard(client, catalog, 'actor', randomUUID(), randomUUID(), resolver)).toBe(
      'ready',
    )
    expect(events).toEqual(['upload', 'finish'])
    rpc.mockImplementation(async () => ({
      data: { status: 'ready', boardId: AI_BOARD },
      error: null,
    }))
    resolver.mockClear()
    expect(await prepareBoard(client, catalog, 'actor', randomUUID(), randomUUID(), resolver)).toBe(
      'ready',
    )
    expect(resolver).not.toHaveBeenCalled()
  })
})

describe('shared prepared boards in PostgreSQL', () => {
  let db: Awaited<ReturnType<typeof makeDatabase>>
  const a = users[0]!,
    b = users[1]!
  const state = (r: RpcResponse) => {
    expect(r.error).toBeUndefined()
    return r.state!
  }
  const admin = async (name: string, args: unknown[]) => {
    const result = await db.admin.query(
      `select public.${name}(${args.map((_, i) => `$${i + 1}`).join(',')}) as result`,
      args,
    )
    return result.rows[0]!.result
  }
  const create = async (id = AI_BOARD) =>
    state(await db.rpc(a, 'create_room_board_v2', ['Alex', randomUUID(), DEFAULT_TIMINGS, id]))
  beforeAll(async () => {
    db = await makeDatabase()
  })
  beforeEach(async () => db.reset())
  afterAll(async () => db?.close())
  it('starts empty, blocks character selection, and commits one identical board for both players', async () => {
    const s = await create(),
      lease = randomUUID()
    expect(s.boardStatus).toBe('pending')
    expect(s.board).toEqual([])
    expect(
      (
        await db.admin.query(
          "select public,allowed_mime_types from storage.buckets where id='game-faces'",
        )
      ).rows[0],
    ).toEqual({ public: true, allowed_mime_types: ['image/webp'] })
    await db.rpc(b, 'join_room_v2', [s.code, 'Jamie'])
    expect(
      (
        await db.rpc(a, 'game_action_v2', [
          s.roomId,
          s.game.id,
          0,
          randomUUID(),
          'select',
          { characterId: 'cache-0' },
        ])
      ).error,
    ).toMatch(/preparing/)
    expect(
      ((await admin('claim_board_v3', [a, s.roomId, s.game.id, lease])) as { status: string })
        .status,
    ).toBe('claimed')
    expect(
      (
        (await admin('claim_board_v3', [b, s.roomId, s.game.id, randomUUID()])) as {
          status: string
        }
      ).status,
    ).toBe('pending')
    const characters = (
      await resolveBoard(catalog, AI_BOARD, async () => {
        throw new SourceUnavailable()
      })
    ).characters
    expect(
      await admin('finish_board_v3', [
        s.roomId,
        s.game.id,
        lease,
        'cache',
        JSON.stringify(characters),
      ]),
    ).toBe(true)
    const first = state(await db.rpc(a, 'get_room_v2', [s.roomId])),
      second = state(await db.rpc(b, 'get_room_v2', [s.roomId]))
    expect(first.board).toEqual(second.board)
    expect(first.boardSource).toBe('cache')
    expect(
      (
        (await admin('claim_board_v3', [a, s.roomId, s.game.id, randomUUID()])) as {
          status: string
        }
      ).status,
    ).toBe('ready')
    await expect(
      db.as(a, (q) =>
        q.query('select public.finish_board_v3($1,$2,$3,$4,$5)', [
          s.roomId,
          s.game.id,
          lease,
          'cache',
          JSON.stringify(characters),
        ]),
      ),
    ).rejects.toThrow()
  })
  it('registers a folder without a per-board migration and validates names at finalization', async () => {
    await admin('register_board_v3', [folder.id, folder.name, folder.version, 'folder'])
    const s = await create(folder.id),
      lease = randomUUID()
    await admin('claim_board_v3', [a, s.roomId, s.game.id, lease])
    const characters = folder.characters.slice(0, 24)
    await expect(
      admin('finish_board_v3', [
        s.roomId,
        s.game.id,
        lease,
        'folder',
        JSON.stringify(characters.map((c) => ({ ...c, name: 'Same' }))),
      ]),
    ).rejects.toThrow(/Duplicate/)
    expect(
      await admin('finish_board_v3', [
        s.roomId,
        s.game.id,
        lease,
        'folder',
        JSON.stringify(characters),
      ]),
    ).toBe(true)
  })
  it('serializes simultaneous preparation claims and ignores completion after leaving', async () => {
    const s = await create(),
      first = randomUUID(),
      second = randomUUID()
    await db.admin.query(
      "update public.rooms set last_activity=clock_timestamp()-interval '25 hours' where id=$1",
      [s.roomId],
    )
    expect(
      ((await admin('claim_board_v3', [a, s.roomId, s.game.id, first])) as { error: string }).error,
    ).toBeDefined()
    await db.admin.query('update public.rooms set last_activity=clock_timestamp() where id=$1', [
      s.roomId,
    ])
    await db.rpc(b, 'join_room_v2', [s.code, 'Jamie'])
    const claims = (await Promise.all([
      admin('claim_board_v3', [a, s.roomId, s.game.id, first]),
      admin('claim_board_v3', [b, s.roomId, s.game.id, second]),
    ])) as { status: string }[]
    expect(claims.map((claim) => claim.status).sort()).toEqual(['claimed', 'pending'])
    const lease = claims[0]!.status === 'claimed' ? first : second
    await db.rpc(a, 'game_action_v2', [s.roomId, s.game.id, 0, randomUUID(), 'leave', {}])
    const characters = (
      await resolveBoard(catalog, AI_BOARD, async () => {
        throw new SourceUnavailable()
      })
    ).characters
    expect(
      await admin('finish_board_v3', [
        s.roomId,
        s.game.id,
        lease,
        'cache',
        JSON.stringify(characters),
      ]),
    ).toBe(false)
    expect(state(await db.rpc(b, 'get_room_v2', [s.roomId])).game.phase).toBe('finished')
  })
  it('recovers failed preparation and prevents a stale worker from replacing a board', async () => {
    const s = await create(),
      old = randomUUID(),
      lease = randomUUID()
    await admin('claim_board_v3', [a, s.roomId, s.game.id, old])
    await admin('fail_board_v3', [s.roomId, s.game.id, old])
    expect(state(await db.rpc(a, 'get_room_v2', [s.roomId])).boardStatus).toBe('error')
    await admin('claim_board_v3', [a, s.roomId, s.game.id, lease])
    const characters = (
      await resolveBoard(catalog, AI_BOARD, async () => {
        throw new SourceUnavailable()
      })
    ).characters
    expect(
      await admin('finish_board_v3', [
        s.roomId,
        s.game.id,
        old,
        'cache',
        JSON.stringify(characters),
      ]),
    ).toBe(false)
    expect(
      await admin('finish_board_v3', [
        s.roomId,
        s.game.id,
        lease,
        'cache',
        JSON.stringify(characters),
      ]),
    ).toBe(true)
  })
  it('prepares a fresh cast after rematch and rejects preparation by an outsider', async () => {
    const s = await create(),
      lease = randomUUID()
    expect(
      ((await admin('claim_board_v3', [users[2], s.roomId, s.game.id, lease])) as { error: string })
        .error,
    ).toBeDefined()
    await db.rpc(b, 'join_room_v2', [s.code, 'Jamie'])
    await admin('claim_board_v3', [a, s.roomId, s.game.id, lease])
    const characters = (
      await resolveBoard(catalog, AI_BOARD, async () => {
        throw new SourceUnavailable()
      })
    ).characters
    await admin('finish_board_v3', [
      s.roomId,
      s.game.id,
      lease,
      'cache',
      JSON.stringify(characters),
    ])
    await db.rpc(a, 'game_action_v2', [s.roomId, s.game.id, 0, randomUUID(), 'leave', {}])
    await db.rpc(a, 'game_action_v2', [s.roomId, s.game.id, 0, randomUUID(), 'rematch', {}])
    const next = state(
      await db.rpc(b, 'game_action_v2', [s.roomId, s.game.id, 0, randomUUID(), 'rematch', {}]),
    )
    expect(next.game.id).not.toBe(s.game.id)
    expect(next.boardStatus).toBe('pending')
    expect(next.board).toEqual([])
  })
  it('starts the matching selection deadline after preparation and expires abandoned leases', async () => {
    const m = (await db.rpc(a, 'matchmake_board_v2', ['Alex', 'join', AI_BOARD])) as RpcResponse & {
      status: string
    }
    expect(m.status).toBe('waiting')
    const pair = (await db.rpc(b, 'matchmake_board_v2', [
      'Jamie',
      'join',
      AI_BOARD,
    ])) as RpcResponse & { roomId: string }
    const s = state(await db.rpc(a, 'get_room_v2', [pair.roomId])),
      old = randomUUID(),
      lease = randomUUID()
    expect(s.game.deadline).toBeNull()
    await admin('claim_board_v3', [a, s.roomId, s.game.id, old])
    await db.admin.query(
      "update public.games set board_lease_until=clock_timestamp()-interval '1 second',created_at=clock_timestamp()-interval '10 minutes' where id=$1",
      [s.game.id],
    )
    expect(
      ((await admin('claim_board_v3', [b, s.roomId, s.game.id, lease])) as { status: string })
        .status,
    ).toBe('claimed')
    const characters = (
      await resolveBoard(catalog, AI_BOARD, async () => {
        throw new SourceUnavailable()
      })
    ).characters
    await admin('finish_board_v3', [
      s.roomId,
      s.game.id,
      lease,
      'cache',
      JSON.stringify(characters),
    ])
    const ready = state(await db.rpc(a, 'get_room_v2', [s.roomId]))
    expect(Date.parse(ready.game.deadline!) - Date.now()).toBeGreaterThan(115000)
    const pulse = (await db.rpc(a, 'matchmake_board_v2', [
      'Alex',
      'pulse',
      AI_BOARD,
    ])) as RpcResponse & { status: string }
    expect(pulse.status).toBe('matched')
    state(
      await db.rpc(a, 'game_action_v2', [
        s.roomId,
        s.game.id,
        0,
        randomUUID(),
        'select',
        { characterId: characters[0]!.id },
      ]),
    )
    state(
      await db.rpc(b, 'game_action_v2', [
        s.roomId,
        s.game.id,
        0,
        randomUUID(),
        'select',
        { characterId: characters[1]!.id },
      ]),
    )
    state(await db.rpc(a, 'game_action_v2', [s.roomId, s.game.id, 0, randomUUID(), 'ready', {}]))
    expect(
      state(await db.rpc(b, 'game_action_v2', [s.roomId, s.game.id, 0, randomUUID(), 'ready', {}]))
        .game.phase,
    ).toBe('question')
  })
})
