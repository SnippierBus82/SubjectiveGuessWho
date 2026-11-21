// Validate bundled portraits offline, or explicitly restore missing/changed derivatives.
// This reads existing dataset images; it does not generate new images.
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'

const root = new URL('../', import.meta.url)
const manifest = JSON.parse(
  await readFile(new URL('artwork/one-million-faces/manifest.json', root), 'utf8'),
)
const pool = JSON.parse(await readFile(new URL('src/game/legacy/face-pool.json', root), 'utf8'))
const restore = process.argv.includes('--restore')
if (process.argv.slice(2).some((arg) => !['--check', '--restore'].includes(arg)))
  throw new Error('Usage: node scripts/face-pool.mjs [--check | --restore]')
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex')
if (JSON.stringify(manifest.faces.map((entry) => entry.character)) !== JSON.stringify(pool))
  throw new Error('Manifest and browser catalog disagree')
if (pool.length !== 144 || new Set(pool.map((c) => c.id)).size !== pool.length)
  throw new Error('Invalid portrait pool')
let total = 0,
  restored = 0
for (const entry of manifest.faces) {
  const { source, character, image } = entry
  if (!/^\/boards\/one-million-faces-v1\/seed\d+\.webp$/.test(character.image))
    throw new Error('Invalid asset path')
  const target = new URL(`public/ai-face-cache/${character.image.split('/').at(-1)}`, root)
  let bytes = await readFile(target).catch(() => null)
  if (!bytes || hash(bytes) !== image.sha256) {
    if (!restore)
      throw new Error(
        `${character.id}: missing or changed. Restore with --restore or review a new pack version.`,
      )
    if (
      !/^seed\d+$/.test(source.key) ||
      source.shard !== '1024x1024/x5_0-29999.tar' ||
      !/^[a-f0-9]{40}$/.test(manifest.revision) ||
      !Number.isSafeInteger(source.offset) ||
      source.offset < 512 ||
      source.length < 1 ||
      source.length > 10_000_000
    )
      throw new Error('Invalid source range')
    const end = source.offset + source.length - 1
    const url = `${manifest.url}/resolve/${manifest.revision}/${source.shard}?sgw-range=${source.offset}`
    const response = await fetch(url, {
      headers: { Range: `bytes=${source.offset}-${end}` },
      signal: AbortSignal.timeout(45000),
    })
    if (
      response.status !== 206 ||
      !response.headers.get('content-range')?.startsWith(`bytes ${source.offset}-${end}/`)
    )
      throw new Error('Server did not honor bounded range; refusing a full-shard download')
    const original = Buffer.from(await response.arrayBuffer())
    if (original.length !== source.length || hash(original) !== source.sha256)
      throw new Error(`Source hash mismatch: ${source.key}`)
    const encoded = spawnSync(
      process.env.PYTHON || 'python',
      [
        '-c',
        `import io,sys
from PIL import Image
im=Image.open(io.BytesIO(sys.stdin.buffer.read()))
assert im.size==(1024,1024)
im.convert('RGB').resize((512,512),Image.Resampling.LANCZOS).save(sys.stdout.buffer,format='WEBP',quality=82,method=6)`,
      ],
      { input: original, windowsHide: true, maxBuffer: 12 * 1024 * 1024 },
    )
    if (encoded.error || encoded.status !== 0)
      throw new Error(
        `Install Python and Pillow ${manifest.encoding.version} to restore portraits. ${encoded.error?.message || encoded.stderr.toString().slice(0, 300)}`,
      )
    bytes = encoded.stdout
    if (hash(bytes) !== image.sha256)
      throw new Error(
        'Encoder output differs from the manifest. Use the recorded Pillow/WebP version; do not silently change a published pack.',
      )
    await mkdir(new URL('public/ai-face-cache/', root), { recursive: true })
    await writeFile(target, bytes)
    restored++
    console.log(`Restored ${source.key}`)
  }
  if (bytes.length !== image.bytes) throw new Error(`Size mismatch: ${character.id}`)
  total += bytes.length
}
console.log(
  `Verified ${pool.length} bundled portraits (${(total / 1024 / 1024).toFixed(2)} MiB); restored ${restored}.`,
)
