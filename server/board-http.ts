import type { IncomingMessage, ServerResponse } from 'node:http'
import { waitUntil } from '@vercel/functions'
import type { BoardCatalog } from '../src/game/board-model.ts'
import {
  backendClient,
  checkedRpc,
  cleanupFaces,
  prepareBoard,
  registerBoard,
} from './board-service.js'
import { resolveBoard } from './faces.js'

export async function boardHttp(
  request: IncomingMessage & { body?: unknown },
  response: ServerResponse,
  catalog: BoardCatalog,
  env: Record<string, string | undefined>,
  allowPreview = false,
) {
  response.setHeader('Cache-Control', 'no-store')
  response.setHeader('Content-Type', 'application/json; charset=utf-8')
  const send = (status: number, data: unknown) => {
    response.statusCode = status
    response.end(JSON.stringify(data))
  }
  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST')
    send(405, { error: 'Use POST.' })
    return
  }
  try {
    let raw = request.body
    if (raw === undefined) {
      const chunks: Buffer[] = []
      let size = 0
      for await (const chunk of request) {
        const bytes = Buffer.from(chunk)
        size += bytes.length
        if (size > 4096) throw new Error('Request is too large.')
        chunks.push(bytes)
      }
      raw = Buffer.concat(chunks).toString()
    }
    const body = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (!body || typeof body !== 'object') throw new Error('Invalid request.')
    if (body.operation === 'preview' && allowPreview && !env.VITE_SUPABASE_URL) {
      const result = await resolveBoard(catalog, String(body.boardId))
      for (const face of result.uploads)
        result.characters.find((c) => c.id === face.id)!.image =
          `data:image/webp;base64,${face.bytes.toString('base64')}`
      send(200, { characters: result.characters, source: result.source })
      return
    }
    const authorization = request.headers.authorization
    if (!authorization?.startsWith('Bearer ')) {
      send(401, { error: 'Reconnect before preparing faces.' })
      return
    }
    const token = authorization.slice(7),
      client = backendClient(env)
    const { data, error } = await client.auth.getUser(token)
    if (error || !data.user) {
      send(401, { error: 'Your session expired. Reconnect and retry.' })
      return
    }
    // Run the endpoint limit with the caller's JWT, not the privileged client's identity.
    const { createClient } = await import('@supabase/supabase-js')
    const userClient = createClient(env.VITE_SUPABASE_URL!, env.VITE_SUPABASE_PUBLISHABLE_KEY!, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    })
    if (!(await checkedRpc(userClient, 'allow_board_request_v3', {}))) {
      send(429, { error: 'Please wait a moment before retrying.' })
      return
    }
    if (body.operation === 'register') {
      await registerBoard(client, catalog, String(body.boardId))
      send(200, { ok: true })
      return
    }
    if (
      body.operation !== 'prepare' ||
      !/^[a-f0-9-]{36}$/i.test(body.roomId) ||
      !/^[a-f0-9-]{36}$/i.test(body.gameId)
    )
      throw new Error('Invalid preparation request.')
    const status = await prepareBoard(client, catalog, data.user.id, body.roomId, body.gameId)
    const { state } = await checkedRpc(userClient, 'get_room_v2', { p_room_id: body.roomId })
    send(status === 'pending' ? 202 : 200, { state })
    waitUntil(cleanupFaces(client).catch(() => {}))
  } catch (error) {
    send(400, {
      error:
        error instanceof Error ? error.message : 'Could not prepare the board. Retry in a moment.',
    })
  }
}
