import type { IncomingMessage, ServerResponse } from 'node:http'
import catalog from '../.generated/boards.json' with { type: 'json' }
import type { BoardCatalog } from '../src/game/board-model.ts'
import { boardHttp } from '../server/board-http.js'
export const config = { maxDuration: 120 }
export default async function handler(
  request: IncomingMessage & { body?: unknown },
  response: ServerResponse,
) {
  await boardHttp(request, response, catalog as BoardCatalog, process.env)
}
