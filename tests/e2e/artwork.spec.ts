import { expect, test } from '@playwright/test'
import { mkdir } from 'node:fs/promises'
test('renders the full portrait library, representative casts, and mobile cards', async ({
  page,
}) => {
  // This renders 110 SVGs plus three contact sheets; allow cold WebKit/font loading.
  test.setTimeout(90000)
  await page.goto('/')
  await page.evaluate(async () => {
    const charPath = '/src/game/legacy/characters.ts',
      partPath = '/src/game/legacy/portraits.ts'
    const { generateBoard } = await import(charPath),
      { portraitSvg, PART_COUNTS } = await import(partPath)
    const base = generateBoard(73519)[0].traits
    const cards = Object.entries(PART_COUNTS).flatMap(([key, n]) =>
      Array.from({ length: n as number }, (_, i) => ({
        name: `${key} ${i + 1}`,
        traits: { ...base, [key]: i },
        color: '#e6dbef',
      })),
    )
    document.body.innerHTML = `<style>body{margin:20px;background:#fff8eb;font:12px system-ui;color:#302640}h1{font-size:25px}.art-grid{display:grid;grid-template-columns:repeat(8,1fr);gap:10px}.art-card{border:4px solid white;border-radius:12px;overflow:hidden;text-align:center}.art-card img{width:100%;display:block}.art-card b{display:block;background:white;padding:6px}</style><h1>110 authored shape variants · renderer v1</h1><main class="art-grid">${cards.map((c) => `<article class="art-card" style="background:${c.color}"><img alt="${c.name}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSvg(c.traits, c.name))}"/><b>${c.name}</b></article>`).join('')}</main>`
  })
  await expect(page.locator('.art-card')).toHaveCount(110)
  expect(
    await page
      .locator('img')
      .evaluateAll((images) =>
        images.every(
          (i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0,
        ),
      ),
  ).toBe(true)
  await mkdir('.local/previews', { recursive: true })
  await page.screenshot({ path: '.local/previews/character-parts.png', fullPage: true })
  for (const seed of [73519, 8426, 2147483646]) {
    await page.evaluate(async (seed) => {
      const charPath = '/src/game/legacy/characters.ts',
        partPath = '/src/game/legacy/portraits.ts'
      const { generateBoard } = await import(charPath),
        { portraitSvg } = await import(partPath)
      document.querySelector('h1')!.textContent = `Shared cast · seed ${seed}`
      document.querySelector('main')!.innerHTML = generateBoard(seed)
        .map(
          (c: { name: string; color: string; traits: unknown }) =>
            `<article class="art-card" style="background:${c.color}"><img alt="${c.name}" src="data:image/svg+xml;charset=utf-8,${encodeURIComponent(portraitSvg(c.traits, c.name))}"/><b>${c.name}</b></article>`,
        )
        .join('')
      ;(document.querySelector('main') as HTMLElement).style.gridTemplateColumns = 'repeat(6,1fr)'
    }, seed)
    await expect(page.locator('.art-card')).toHaveCount(24)
    await page.screenshot({ path: `.local/previews/character-cast-${seed}.png`, fullPage: true })
  }
})
