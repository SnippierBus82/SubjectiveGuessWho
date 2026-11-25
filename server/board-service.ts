import { randomUUID } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { AI_BOARD, type BoardCatalog } from '../src/game/board-model.js'
import { resolveBoard } from './faces.js'

class BoardRpcError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly reason: string,
  ) {
    super(message)
  }
}

export function backendClient(env: Record<string, string | undefined>) {
  const url = env.VITE_SUPABASE_URL,
    secret = env.SUPABASE_SECRET_KEY
  if (!secret)
    throw new Error(
      'Online board preparation needs SUPABASE_SECRET_KEY. Add it to .env.local and restart Vite; on Vercel, add it to the server environment variables and redeploy. Find it in Supabase Settings > API Keys > Publishable and secret API keys. Do not use a VITE_ prefix.',
    )
  if (!url)
    throw new Error(
      'Set VITE_SUPABASE_URL in .env.local or Vercel environment variables, then restart Vite or redeploy.',
    )
  return createClient(url, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(10_000) }),
    },
  })
}
export async function checkedRpc(
  client: SupabaseClient,
  name: string,
  args: Record<string, unknown>,
) {
  const { data, error } = await client.rpc(name, args)
  if (error) {
    const rejection = name === 'finish_board_v3' && error.code === 'P0001'
    const reason =
      rejection &&
      /^(Invalid board|A board needs 24 images|Duplicate characters or names|Invalid character|Wrong board source)$/.test(
        error.message,
      )
        ? error.message
        : undefined
    console.warn('Board request failed', {
      operation: name,
      code: error.code,
      ...(rejection && { source: args.p_source, reason }),
    })
    throw new BoardRpcError(
      error.code === 'PGRST202'
        ? 'Apply the latest database migration before preparing boards.'
        : rejection
          ? 'The database rejected the prepared faces. Retry or check the board backend logs.'
          : 'Board preparation could not connect. Retry in a moment.',
      error.code,
      error.message,
    )
  }
  if (data?.error) throw new Error(data.error)
  return data
}
export async function registerBoard(client: SupabaseClient, catalog: BoardCatalog, id: string) {
  const folder = catalog.boards.find((board) => board.id === id)
  if (id !== AI_BOARD && !folder)
    throw new Error('This board is no longer available. Choose another board.')
  await checkedRpc(client, 'register_board_v3', {
    p_id: id,
    p_name: folder?.name ?? 'Random AI faces',
    p_version: folder?.version ?? '1',
    p_kind: folder ? 'folder' : 'synthetic-photo',
  })
}
export async function prepareBoard(
  client: SupabaseClient,
  catalog: BoardCatalog,
  actor: string,
  room: string,
  game: string,
  resolve = resolveBoard,
) {
  const lease = randomUUID()
  const claim = await checkedRpc(client, 'claim_board_v3', {
    p_actor: actor,
    p_room: room,
    p_game: game,
    p_lease: lease,
  })
  if (claim.status !== 'claimed') return claim.status as 'ready' | 'pending'
  try {
    const resolved = await resolve(catalog, claim.boardId)
    // Persist image bytes before exposing the board. Never store expiring provider URLs.
    for (let i = 0; i < resolved.uploads.length; i += 6) {
      await Promise.all(
        resolved.uploads.slice(i, i + 6).map(async (face) => {
          const path = `${game}/${face.id}.webp`
          const { error } = await client.storage.from('game-faces').upload(path, face.bytes, {
            contentType: 'image/webp',
            cacheControl: '31536000',
            upsert: false,
            metadata: {
              source: face.source,
              dataset: 'RichardErkhov/OneMillionFaces',
              license: 'MIT',
            },
          })
          if (
            error &&
            !['409', 'Duplicate'].includes(String('statusCode' in error ? error.statusCode : '')) &&
            !/already exists|duplicate/i.test(error.message)
          )
            throw new Error('Could not save the selected faces. Check Supabase Storage and retry.')
          resolved.characters.find((c) => c.id === face.id)!.image = client.storage
            .from('game-faces')
            .getPublicUrl(path).data.publicUrl
        }),
      )
    }
    const finishArgs = {
      p_room: room,
      p_game: game,
      p_lease: lease,
      p_source: resolved.source,
      p_characters: resolved.characters,
    }
    const committed = await checkedRpc(client, 'finish_board_v3', finishArgs).catch(
      (error: unknown) => {
        // Older deployed schemas recognize the original URL for the same bundled portraits.
        if (
          resolved.source !== 'cache' ||
          !(error instanceof BoardRpcError) ||
          error.code !== 'P0001' ||
          error.reason !== 'Invalid character' ||
          !resolved.characters.every((face) => face.image.startsWith('/fallback-faces/'))
        )
          throw error
        return checkedRpc(client, 'finish_board_v3', {
          ...finishArgs,
          p_characters: resolved.characters.map((face) => ({
            ...face,
            image: face.image.replace('/fallback-faces/', '/ai-face-cache/'),
          })),
        })
      },
    )
    if (!committed)
      throw new Error('This game changed while the faces were preparing. Reconnect to the room.')
    return 'ready'
  } catch (error) {
    await checkedRpc(client, 'fail_board_v3', { p_room: room, p_game: game, p_lease: lease }).catch(
      () => {},
    )
    throw error
  }
}
export async function cleanupFaces(client: SupabaseClient) {
  const offset = await checkedRpc(client, 'claim_face_cleanup_v3', {})
  if (offset === null) return
  const { data: folders, error } = await client.storage
    .from('game-faces')
    .list('', { limit: 100, offset, sortBy: { column: 'name', order: 'asc' } })
  if (error || !folders) return
  const ids = folders.map((folder) => folder.name).filter((name) => /^[a-f0-9-]{36}$/i.test(name))
  const existing = new Set(
    (await checkedRpc(client, 'existing_face_games_v3', { p_ids: ids })) as string[],
  )
  for (const id of ids)
    if (!existing.has(id)) {
      const { data: files } = await client.storage.from('game-faces').list(id, { limit: 100 })
      const expired =
        files
          ?.filter(
            (file) => file.created_at && Date.parse(file.created_at) < Date.now() - 86_400_000,
          )
          .map((file) => `${id}/${file.name}`) ?? []
      if (expired.length) await client.storage.from('game-faces').remove(expired)
    }
  await checkedRpc(client, 'claim_face_cleanup_v3', {
    p_offset: folders.length === 100 ? offset + 100 : 0,
  })
}
