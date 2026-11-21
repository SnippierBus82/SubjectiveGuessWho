import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const root = new URL('../artwork/3d-cast/', import.meta.url)
const read = async (name) =>
  JSON.parse((await readFile(new URL(name, root), 'utf8')).replace(/^\uFEFF/, ''))
const catalog = await read('characters.json')
const checking = process.argv.includes('--check')
const has = (object, key) => Object.prototype.hasOwnProperty.call(object, key)
function assert(ok, message) {
  if (!ok) throw new Error(message)
}
const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value)
const requiredTraitKeys = [
  'ageBand',
  'presentation',
  'skinTone',
  'faceShape',
  'nose',
  'eyes',
  'hair',
  'facialHair',
  'glasses',
  'headwear',
  'earrings',
  'outfit',
  'skinDetails',
  'expression',
]
const accessoryKeys = ['facialHair', 'glasses', 'headwear', 'earrings']
function validateTraits(traits, id) {
  assert(isObject(traits), `${id}: traits must be an object`)
  assert(
    requiredTraitKeys.every((key) => has(traits, key)),
    `${id}: missing trait fields`,
  )
  assert(
    ['20s', '30s', '40s', '50s', '60s', '70s'].includes(traits.ageBand),
    `${id}: invalid adult age band`,
  )
  assert(
    ['feminine', 'masculine', 'androgynous'].includes(traits.presentation),
    `${id}: invalid presentation`,
  )
  assert(
    ['very-light', 'light', 'medium-light', 'medium', 'medium-deep', 'deep', 'very-deep'].includes(
      traits.skinTone,
    ),
    `${id}: invalid skin tone`,
  )
  for (const key of ['faceShape', 'nose', 'expression'])
    assert(typeof traits[key] === 'string' && traits[key].length > 0, `${id}: missing ${key}`)
  for (const key of ['eyes', 'hair', 'outfit', ...accessoryKeys])
    assert(isObject(traits[key]), `${id}: ${key} must be an object`)
  for (const key of accessoryKeys) {
    assert(
      typeof traits[key].style === 'string' && has(traits[key], 'color'),
      `${id}: incomplete ${key}`,
    )
    assert(
      traits[key].style === 'none'
        ? traits[key].color === null
        : typeof traits[key].color === 'string',
      `${id}: ${key} none requires null colour; a visible accessory needs a colour`,
    )
  }
  assert(
    typeof traits.hair.style === 'string' &&
      (traits.hair.color === null || typeof traits.hair.color === 'string'),
    `${id}: invalid hair`,
  )
  assert(
    typeof traits.eyes.color === 'string' && typeof traits.eyes.shape === 'string',
    `${id}: invalid eyes`,
  )
  assert(
    typeof traits.outfit.type === 'string' &&
      typeof traits.outfit.color === 'string' &&
      has(traits.outfit, 'accentColor'),
    `${id}: invalid outfit`,
  )
  assert(
    Array.isArray(traits.skinDetails) && traits.skinDetails.every((v) => typeof v === 'string'),
    `${id}: skinDetails must be an array`,
  )
}
function describe(traits) {
  const line = (value) => value.replaceAll('-', ' ')
  const accessory = (key) =>
    traits[key].style === 'none' ? 'none' : `${line(traits[key].style)}; ${line(traits[key].color)}`
  return [
    `Approximate age: ${traits.ageBand}. Adult ${traits.presentation} presentation.`,
    `Skin tone: ${line(traits.skinTone)}. Face shape: ${line(traits.faceShape)}. Nose: ${traits.nose}.`,
    `Eyes: ${line(traits.eyes.color)}, ${line(traits.eyes.shape)}.`,
    `Hair: ${line(traits.hair.style)}; colour ${traits.hair.color ? line(traits.hair.color) : 'none'}; texture ${traits.hair.texture ?? 'none'}.`,
    `Facial hair: ${accessory('facialHair')}. Glasses: ${accessory('glasses')}.`,
    `Headwear: ${accessory('headwear')}. Earrings: ${accessory('earrings')}.`,
    `Clothing: ${line(traits.outfit.type)} in ${line(traits.outfit.color)}${traits.outfit.accentColor ? `, with ${line(traits.outfit.accentColor)} accents` : ''}.`,
    `Visible details: ${traits.skinDetails.length ? traits.skinDetails.join('; ') : 'none'}.`,
    `Expression: ${traits.expression}`,
  ].join('\n')
}
assert(
  catalog.schemaVersion === 1 && catalog.styleId === 'sgw-3d-adult-v1',
  'Unexpected catalog version/style',
)
assert(
  Array.isArray(catalog.characters) && catalog.characters.length === 72,
  'Expected exactly 72 character briefs',
)
const ids = new Set(),
  names = new Set(),
  files = new Set()
const template = (await readFile(new URL('STYLE_PROMPT.txt', root), 'utf8')).replace(/^\uFEFF/, '')
const outputs = []
for (const character of catalog.characters) {
  const { id, name, status, fileName } = character
  assert(
    /^sgw-\d{3}$/.test(id) && Number(id.slice(4)) >= 1 && Number(id.slice(4)) <= 72,
    `Invalid ID: ${id}`,
  )
  assert(
    !ids.has(id) && !names.has(name) && !files.has(fileName),
    `Duplicate identity/name/file: ${id}`,
  )
  ids.add(id)
  names.add(name)
  files.add(fileName)
  assert(fileName === `${id}.png`, `${id}: fileName must match immutable ID`)
  assert(
    typeof character.brief === 'string' && character.brief.length > 30,
    `${id}: missing individual brief`,
  )
  assert(['planned', 'generated', 'verified', 'approved'].includes(status), `${id}: invalid status`)
  validateTraits(character.intendedTraits, id)
  if (status === 'verified' || status === 'approved') {
    validateTraits(character.observedTraits, id)
    assert(
      typeof character.altText === 'string' && character.altText.trim().length > 0,
      `${id}: verified images need accurate altText`,
    )
    assert(
      character.review.reviewedBy && character.review.reviewedAt,
      `${id}: verification needs a reviewer and date`,
    )
  } else if (character.observedTraits !== null) validateTraits(character.observedTraits, id)
  if (status === 'generated' || status === 'verified' || status === 'approved') {
    assert(
      character.image.width > 0 &&
        character.image.height > 0 &&
        /^[a-f0-9]{64}$/.test(character.image.sha256 ?? ''),
      `${id}: inspect the actual file before marking it generated`,
    )
  }
  const prompt =
    template
      .replace('{{CHARACTER_BRIEF}}', character.brief)
      .replace('{{INTENDED_TRAITS}}', describe(character.intendedTraits))
      .replace('{{FILE_NAME}}', fileName)
      .trim() + '\n'
  assert(!/\{\{[A-Z_]+\}\}/.test(prompt), `${id}: unresolved prompt placeholders`)
  const promptPath = new URL(`prompts/${id}.txt`, root)
  outputs.push({ promptPath, prompt })
  if (checking) {
    assert(
      (await readFile(promptPath, 'utf8')) === prompt,
      `${id}: prompt is stale; regenerate the kit`,
    )
  }
}
const columns = [
  'id',
  'name',
  'status',
  'fileName',
  'brief',
  'ageBand',
  'presentation',
  'skinTone',
  'faceShape',
  'nose',
  'eyes',
  'hair',
  'facialHair',
  'glasses',
  'headwear',
  'earrings',
  'outfit',
  'skinDetails',
  'expression',
]
const quote = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`
const csv =
  [
    columns.map(quote).join(','),
    ...catalog.characters.map((c) =>
      columns
        .map((key) => {
          const value = has(c, key) ? c[key] : c.intendedTraits[key]
          return quote(typeof value === 'object' ? JSON.stringify(value) : value)
        })
        .join(','),
    ),
  ].join('\r\n') + '\r\n'
if (checking) {
  assert(
    (await readFile(new URL('characters.csv', root), 'utf8')) === csv,
    'CSV is stale; regenerate the kit',
  )
} else {
  await mkdir(new URL('prompts/', root), { recursive: true })
  for (const output of outputs) await writeFile(output.promptPath, output.prompt)
  await writeFile(new URL('characters.csv', root), csv)
}
const summary = {
  mode: checking ? 'validated' : 'prepared',
  characters: ids.size,
  prompts: outputs.length,
  approved: catalog.characters.filter((c) => c.status === 'approved').length,
}
console.log(JSON.stringify(summary, null, 2))
console.log(`Kit: ${fileURLToPath(root)}`)
