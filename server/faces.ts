import sharp from 'sharp'
import { createHash } from 'node:crypto'
import names from '../src/game/neutral-names.json' with { type: 'json' }
import {
  AI_BOARD,
  sample,
  type BoardCatalog,
  type ImageCharacter,
} from '../src/game/board-model.ts'

export class SourceUnavailable extends Error {}
export interface OnlineFace {
  id: string
  bytes: Buffer
  source: string
}
export interface ResolvedBoard {
  source: 'folder' | 'online' | 'cache'
  characters: ImageCharacter[]
  uploads: OnlineFace[]
}
const viewer = 'https://datasets-server.huggingface.co/rows'
const dataset = 'RichardErkhov/OneMillionFaces'
export async function boundedBytes(response: Response, maximum = 8 * 1024 * 1024): Promise<Buffer> {
  if (Number(response.headers.get('content-length')) > maximum)
    throw new Error('Response is too large.')
  const reader = response.body?.getReader()
  if (!reader) throw new Error('Empty response.')
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > maximum) throw new Error('Response is too large.')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  return Buffer.concat(chunks)
}
export async function onlineFaces(
  fetcher: typeof fetch = fetch,
  budgetMs = 12_000,
): Promise<OnlineFace[]> {
  const signal = AbortSignal.timeout(budgetMs)
  const rows = async (offset: number, length: number) => {
    const url = new URL(viewer)
    for (const [key, value] of Object.entries({
      dataset,
      config: 'default',
      split: 'train',
      offset: String(offset),
      length: String(length),
    }))
      url.searchParams.set(key, value)
    const response = await fetcher(url, { signal, redirect: 'error' })
    if (!response.ok) throw new Error(`Source returned ${response.status}.`)
    return JSON.parse((await boundedBytes(response, 2_000_000)).toString()) as {
      num_rows_total: number
      rows: { row: { png?: { src?: string }; __key__?: string; __url__?: string } }[]
    }
  }
  try {
    const info = await rows(0, 1)
    if (!Number.isSafeInteger(info.num_rows_total) || info.num_rows_total < 24)
      throw new Error('Source has fewer than 24 usable rows.')
    const length = Math.min(100, info.num_rows_total)
    const offset = Math.floor(
      (crypto.getRandomValues(new Uint32Array(1))[0]! / 4294967296) *
        (info.num_rows_total - length + 1),
    )
    let page
    try {
      page = await rows(offset, length)
      if (page.rows.length < 24)
        throw new Error('The requested slice is not exposed by this viewer.')
    } catch (error) {
      if (signal.aborted || offset === 0) throw error
      // Partial viewer exports may report a larger total than their accessible slice.
      // Try the known beginning while still online, within the same deadline.
      page = await rows(0, length)
    }
    const candidates = sample(page.rows, page.rows.length),
      result: OnlineFace[] = [],
      seen = new Set<string>()
    for (let i = 0; i < candidates.length && result.length < 24; i += 6) {
      if (signal.aborted) throw new Error('Source timed out.')
      const batch = await Promise.allSettled(
        candidates.slice(i, i + 6).map(async ({ row }) => {
          const url = new URL(row.png?.src ?? '')
          if (
            url.protocol !== 'https:' ||
            !(
              url.hostname === 'huggingface.co' ||
              url.hostname.endsWith('.huggingface.co') ||
              url.hostname.endsWith('.hf.co')
            )
          )
            throw new Error('Unexpected source image host.')
          const response = await fetcher(url, { signal })
          if (!response.ok || !response.headers.get('content-type')?.startsWith('image/'))
            throw new Error('Image unavailable.')
          const raw = await boundedBytes(response)
          const bytes = await sharp(raw, { limitInputPixels: 16_000_000, animated: false })
            .rotate()
            .resize(512, 512, { fit: 'inside', withoutEnlargement: true })
            .webp({ quality: 82 })
            .toBuffer()
          const digest = createHash('sha256').update(bytes).digest('hex')
          return {
            id: `ai-${digest}`,
            bytes,
            source: `${row.__url__ ?? dataset}#${row.__key__ ?? 'unknown'}`,
          }
        }),
      )
      for (const entry of batch)
        if (entry.status === 'fulfilled' && !seen.has(entry.value.id)) {
          seen.add(entry.value.id)
          result.push(entry.value)
        }
    }
    if (signal.aborted || result.length < 24)
      throw new Error('Source could not supply a complete board in time.')
    return result.slice(0, 24)
  } catch {
    throw new SourceUnavailable('The online face source is unavailable.')
  }
}
export async function resolveBoard(
  catalog: BoardCatalog,
  id: string,
  acquire = onlineFaces,
): Promise<ResolvedBoard> {
  const folder = catalog.boards.find((board) => board.id === id)
  if (folder) return { source: 'folder', characters: sample(folder.characters, 24), uploads: [] }
  if (id !== AI_BOARD) throw new Error('This board is no longer available. Choose another board.')
  let uploads: OnlineFace[]
  try {
    uploads = await acquire()
  } catch (error) {
    if (!(error instanceof SourceUnavailable)) throw error
    const chosen = sample(catalog.cache, 24),
      chosenNames = sample(names, 24)
    return {
      source: 'cache',
      characters: chosen.map((face, i) => ({ ...face, name: chosenNames[i]! })),
      uploads: [],
    }
  }
  if (uploads.length !== 24 || new Set(uploads.map((f) => f.id)).size !== 24)
    throw new Error('Invalid online board result.')
  const chosenNames = sample(names, 24)
  return {
    source: 'online',
    characters: uploads.map((face, i) => ({ id: face.id, name: chosenNames[i]!, image: '' })),
    uploads,
  }
}
