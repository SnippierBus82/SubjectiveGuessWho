import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { discoverBoards } from '../server/catalog.ts'
const root = resolve('.')
const catalog = await discoverBoards(root, !process.argv.includes('--development'))
await mkdir(resolve(root, '.generated'), { recursive: true })
await writeFile(resolve(root, '.generated/boards.json'), JSON.stringify(catalog, null, 2) + '\n')
console.log(
  `Boards: ${catalog.boards.length} folders, one online AI option, ${catalog.cache.length} fallback portraits.`,
)
