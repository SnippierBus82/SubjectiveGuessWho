import { readFile, readdir, writeFile } from 'node:fs/promises'

const root = new URL('../', import.meta.url)
const lock = JSON.parse(await readFile(new URL('package-lock.json', root), 'utf8'))
const sections = [
  'Third-party notices for bundled production dependencies.\nGenerated from installed package license files; original notices are preserved.',
]
for (const [packagePath, entry] of Object.entries(lock.packages)) {
  if (!packagePath.startsWith('node_modules/') || entry.dev || entry.optional) continue
  const directory = new URL(`${packagePath}/`, root)
  const pkg = JSON.parse(await readFile(new URL('package.json', directory), 'utf8'))
  const names = await readdir(directory)
  const licenses = names.filter((name) => /^(license|licence|copying)(\.(md|txt))?$/i.test(name))
  const texts = await Promise.all(
    licenses.map((name) => readFile(new URL(name, directory), 'utf8')),
  )
  sections.push(
    `${pkg.name} ${pkg.version}\n${'='.repeat(60)}\n${texts.join('\n\n') || `License identifier: ${JSON.stringify(pkg.license)}`}`,
  )
}
await writeFile(
  new URL('public/THIRD_PARTY_NOTICES.txt', root),
  `${sections.join('\n\n\n').trimEnd()}\n`,
)
console.log(`Preserved notices for ${sections.length - 1} production packages.`)
