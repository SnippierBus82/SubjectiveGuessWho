import { readdir, readFile } from 'node:fs/promises'
import { basename, extname, join } from 'node:path'
import { createHash } from 'node:crypto'
import sharp from 'sharp'
import type { BoardCatalog, FolderBoard, ImageCharacter } from '../src/game/board-model.ts'

const supported = new Set(['.png', '.jpg', '.jpeg', '.webp', '.avif', '.svg'])
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
export async function discoverBoards(root: string, strict = true): Promise<BoardCatalog> {
  const directory = join(root, 'public', 'boards')
  const boards: FolderBoard[] = []
  for (const folder of (await readdir(directory, { withFileTypes: true })).sort((a, b) =>
    a.name.localeCompare(b.name, 'en'),
  )) {
    if (!folder.isDirectory() || folder.name.startsWith('.')) continue
    try {
      if (folder.name.length > 120 || `folder/${encodeURIComponent(folder.name)}`.length > 400)
        throw new Error('The folder name is too long.')
      const characters: ImageCharacter[] = [],
        names = new Set<string>(),
        images = new Set<string>()
      for (const file of (
        await readdir(join(directory, folder.name), { withFileTypes: true })
      ).sort((a, b) => a.name.localeCompare(b.name, 'en'))) {
        if (!file.isFile() || !supported.has(extname(file.name).toLowerCase())) continue
        const name = basename(file.name, extname(file.name)).normalize('NFC')
        if (
          !name.trim() ||
          name !== name.trim() ||
          name.length > 80 ||
          /[\u0000-\u001f]/.test(name)
        )
          throw new Error(`Invalid character name: ${file.name}`)
        if (names.has(name.toLocaleLowerCase('en')))
          throw new Error(`Duplicate character name: ${name}`)
        const bytes = await readFile(join(directory, folder.name, file.name))
        const metadata = await sharp(bytes, { limitInputPixels: 40_000_000 }).metadata()
        if (!metadata.width || !metadata.height) throw new Error(`Unreadable image: ${file.name}`)
        const digest = hash(bytes)
        if (images.has(digest)) throw new Error(`Duplicate image: ${file.name}`)
        names.add(name.toLocaleLowerCase('en'))
        images.add(digest)
        characters.push({
          id: `file-${digest.slice(0, 24)}`,
          name,
          image: `/boards/${encodeURIComponent(folder.name)}/${encodeURIComponent(file.name)}`,
        })
      }
      if (characters.length < 24)
        throw new Error(
          `${characters.length}/24 images; add at least ${24 - characters.length} more`,
        )
      boards.push({
        id: `folder/${encodeURIComponent(folder.name)}`,
        name: folder.name,
        kind: 'folder',
        version: hash(JSON.stringify(characters)),
        characters,
      })
    } catch (error) {
      const message = `Board “${folder.name}”: ${error instanceof Error ? error.message : String(error)}`
      if (strict) throw new Error(message)
      console.warn(message)
    }
  }
  const cacheDirectory = join(root, 'public', 'ai-face-cache')
  const cache = (await readdir(cacheDirectory))
    .filter((file) => /^seed\d+\.webp$/.test(file))
    .sort()
    .map((file) => ({ id: `cached-${basename(file, '.webp')}`, image: `/ai-face-cache/${file}` }))
  if (cache.length < 24) throw new Error('The AI fallback needs at least 24 cached portraits.')
  return { boards, cache }
}
