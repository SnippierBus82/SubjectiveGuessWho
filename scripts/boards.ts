import { copyFile, mkdir, readdir, readFile, unlink, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import { gunzipSync } from 'node:zlib'
import { discoverBoards } from '../server/catalog.ts'

const root = resolve('.')
const fallbackDirectory = resolve(root, 'public/fallback-faces')
const portraits = JSON.parse(
  gunzipSync(await readFile(resolve(root, 'assets/fallback-faces.json.gz'))).toString('utf8'),
) as Record<string, string>
const portraitFile = /^seed\d+\.webp$/
await mkdir(fallbackDirectory, { recursive: true })
const existing = await readdir(fallbackDirectory, { withFileTypes: true })
await Promise.all([
  ...existing
    .filter(
      (file) =>
        file.isFile() && portraitFile.test(file.name) && !Object.hasOwn(portraits, file.name),
    )
    .map((file) => unlink(resolve(fallbackDirectory, file.name))),
  ...Object.entries(portraits).map(([file, content]) => {
    if (!portraitFile.test(file)) throw new Error(`Invalid fallback portrait: ${file}`)
    return writeFile(resolve(fallbackDirectory, file), Buffer.from(content, 'base64'))
  }),
  copyFile(
    resolve(root, 'assets/OneMillionFaces-NOTICE.txt'),
    resolve(fallbackDirectory, 'NOTICE.txt'),
  ),
])

const catalog = await discoverBoards(root, !process.argv.includes('--development'))
await mkdir(resolve(root, '.generated'), { recursive: true })
await writeFile(resolve(root, '.generated/boards.json'), JSON.stringify(catalog, null, 2) + '\n')
console.log(
  `Boards: ${catalog.boards.length} folders, one online AI option, ${catalog.cache.length} fallback portraits.`,
)
