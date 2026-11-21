import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import sharp from 'sharp'
import opentype from 'opentype.js'
const source = await readFile(new URL('../public/SGW.svg', import.meta.url), 'utf8')
const svg = source.includes('viewBox=')
  ? source
  : source.replace('<svg ', '<svg viewBox="0 0 2282 2203" ')
const logo = await sharp(Buffer.from(svg))
  .ensureAlpha()
  .resize(340, 340, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
  .png()
  .toBuffer()
const font = async (path) => {
  const bytes = await readFile(new URL(path, import.meta.url))
  return opentype.parse(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength))
}
const display = await font(
  '../node_modules/@fontsource/fredoka/files/fredoka-latin-500-normal.woff',
)
const text = (font, value, x, y, size, fill) => {
  const path = font.getPath(value, x, y, size)
  // Serialize coordinates directly: opentype's decimal rounding can emit NaN
  // for valid floating-point coordinates, truncating the rendered text.
  const coordinates = {
    M: ['x', 'y'],
    L: ['x', 'y'],
    Q: ['x1', 'y1', 'x', 'y'],
    C: ['x1', 'y1', 'x2', 'y2', 'x', 'y'],
    Z: [],
  }
  const data = path.commands
    .map((command) => {
      const values = coordinates[command.type].map((key) => {
        if (!Number.isFinite(command[key])) throw new Error(`Invalid title coordinate: ${value}`)
        return command[key].toFixed(2)
      })
      return command.type + values.join(' ')
    })
    .join('')
  return `<path d="${data}" fill="${fill}"/>`
}
const banner = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#fff8eb"/>${text(display, 'Subjective', 585, 300, 80, '#22213a')}${text(display, 'Guess Who', 585, 395, 80, '#7459f1')}</svg>`
await sharp(Buffer.from(banner))
  .composite([{ input: logo, left: 205, top: 145 }])
  .png()
  .toFile(fileURLToPath(new URL('../public/social-preview.png', import.meta.url)))
console.log('Updated sharing banner from the supplied SGW.svg artwork.')
// Keep the source art intact. Existing favicon/install icons are owner-supplied.
