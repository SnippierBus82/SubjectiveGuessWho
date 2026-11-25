import { expect, test, previewResult } from './fixtures'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { resolve, sep } from 'node:path'
import { randomUUID } from 'node:crypto'
import AxeBuilder from '@axe-core/playwright'

test('home shows Neighborhood and the AI picker uses bundled previews', async ({ page }) => {
  const externalFaces: string[] = []
  page.on('request', (request) => {
    if (/huggingface\.co|\.hf\.co/.test(request.url())) externalFaces.push(request.url())
  })
  await page.goto('/')
  const hero = page.locator('.hero-face-stack img')
  await expect(hero).toHaveCount(4)
  await expect
    .poll(() =>
      hero.evaluateAll((images) =>
        images.every(
          (image) =>
            (image as HTMLImageElement).naturalWidth > 0 &&
            image.getAttribute('src')?.startsWith('/boards/Neighborhood/'),
        ),
      ),
    )
    .toBe(true)
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  const board = page.getByLabel('Board', { exact: true })
  await expect(board.locator('option[value="ai-random"]')).toHaveText('Random AI faces')
  await expect(board.locator('option[value="folder/Neighborhood"]')).toHaveText('Neighborhood')
  const previews = page.locator('.board-picker-preview img')
  await expect(previews).toHaveCount(4)
  await expect
    .poll(() =>
      previews.evaluateAll((images) =>
        images.every((image) => {
          const img = image as HTMLImageElement
          return (
            img.complete &&
            img.naturalWidth > 0 &&
            img.getAttribute('src')?.startsWith('/fallback-faces/')
          )
        }),
      ),
    )
    .toBe(true)
  const sources = await previews.evaluateAll((images) =>
    images.map((image) => image.getAttribute('src')),
  )
  expect(new Set(sources).size).toBe(4)
  await page.getByLabel('What should your friend call you?').fill('Robin')
  expect(
    await previews.evaluateAll((images) => images.map((image) => image.getAttribute('src'))),
  ).toEqual(sources)
  await page.reload()
  await expect(previews.first()).toHaveAttribute('src', sources[0]!)
  await board.selectOption('folder/Neighborhood')
  await page.getByLabel('What should your friend call you?').fill('Robin')
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  await expect(page.locator('.character-card img[src^="/boards/Neighborhood/"]')).toHaveCount(24)
  expect(externalFaces).toEqual([])
})

for (const source of ['online', 'cache']) {
  const boardId = 'ai-random'
  test(`${source}: mobile portraits load, secrets persist, and rematches keep the board choice`, async ({
    page,
  }) => {
    // Includes cold WebKit startup, two reloads, axe, a full game, and a rematch.
    test.setTimeout(90_000)
    await page.setViewportSize({ width: 390, height: 844 })
    await page.clock.install()
    const externalFaces: string[] = []
    page.on('request', (request) => {
      if (/huggingface\.co/.test(request.url())) externalFaces.push(request.url())
    })
    await page.route('**/api/boards', (route) => route.fulfill({ json: previewResult(source) }))
    await page.goto('/')
    await page.getByRole('button', { name: 'Create game', exact: true }).click()
    await page.getByLabel('What should your friend call you?').fill('Robin')
    await page.getByLabel('Board', { exact: true }).selectOption(boardId)
    await expect(page.locator('#board-description')).toContainText('24 faces')
    await expect(page.locator('.board-picker-preview img')).toHaveCount(4)
    await page.reload()
    await expect(page.getByLabel('Board', { exact: true })).toHaveValue(boardId)
    await page.getByLabel('What should your friend call you?').fill('Robin')
    await page.getByRole('button', { name: 'Create game', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pick your person.', level: 1 })).toBeVisible()
    const portraits = page.locator('.character-card img')
    await expect(portraits).toHaveCount(24)
    await expect
      .poll(() =>
        portraits.evaluateAll((images) =>
          images.every(
            (image) =>
              (image as HTMLImageElement).complete &&
              (image as HTMLImageElement).naturalWidth === 512,
          ),
        ),
      )
      .toBe(true)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    const before = await page.evaluate(
      () => JSON.parse(localStorage.getItem('sgw:preview2')!).state,
    )
    expect(before.boardId).toBe(boardId)
    const axe = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
    expect(axe.violations).toEqual([])
    await page.locator('.character-card').nth(0).click()
    await page.getByRole('button', { name: 'I’m ready', exact: true }).click()
    await page.getByRole('button', { name: 'Switch seat' }).click()
    await page.locator('.character-card').nth(1).click()
    await page.getByRole('button', { name: 'I’m ready', exact: true }).click()
    await expect(page.getByText('Round 1 · 1/2', { exact: true })).toBeVisible()
    if (!(await page.getByLabel('Your question', { exact: true }).isVisible()))
      await page.getByRole('button', { name: 'Switch seat' }).click()
    await page.getByLabel('Your question', { exact: true }).fill('Would they enjoy a road trip?')
    await page.getByRole('button', { name: 'Ask question', exact: true }).click()
    await page.getByRole('button', { name: 'Switch seat' }).click()
    await expect(page.locator('.answer-secret img')).toHaveAttribute('src', /\/fallback-faces\//)
    await page.reload()
    await expect(page.locator('.answer-secret img')).toBeVisible()
    expect(
      await page.evaluate(() => JSON.parse(localStorage.getItem('sgw:preview2')!).state.board),
    ).toEqual(before.board)
    await page.getByRole('button', { name: 'YES', exact: true }).click()
    await page.getByRole('button', { name: 'Final guess' }).click()
    const target = await page.evaluate(() => {
      const r = JSON.parse(localStorage.getItem('sgw:preview2')!)
      const other = r.state.game.activePlayer === 'preview-one' ? 'preview-two' : 'preview-one'
      return r.state.board.findIndex(
        (face: { id: string }) => face.id === r.secrets[other],
      ) as number
    })
    await page.locator('.character-card').nth(target).click()
    await page.getByRole('button', { name: 'Confirm final guess' }).click()
    await expect(page.getByRole('heading', { name: 'You called it.' })).toBeVisible()
    const rematchName = 'Play again with a fresh cast'
    await page.getByRole('button', { name: rematchName, exact: true }).click()
    await page.getByRole('button', { name: 'Switch seat' }).click()
    await page.getByRole('button', { name: rematchName, exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pick your person.', level: 1 })).toBeVisible()
    const after = await page.evaluate(() => JSON.parse(localStorage.getItem('sgw:preview2')!).state)
    expect(after.boardId).toBe(boardId)
    expect(after.board).not.toEqual(before.board)
    expect(externalFaces).toEqual([])
  })
}

test('a new image folder appears automatically and filenames become the selected characters', async ({
  page,
}) => {
  test.setTimeout(90_000)
  const name = `Browser board ${test.info().project.name} ${randomUUID().slice(0, 8)}`
  const path = resolve('public/boards', name),
    base = resolve('public/boards') + sep
  if (!path.startsWith(base)) throw new Error('Unexpected board fixture path')
  let created = false
  try {
    await page.goto('/')
    await page.getByRole('button', { name: 'Create game', exact: true }).click()
    await mkdir(path)
    created = true
    for (let i = 0; i < 25; i++)
      await writeFile(
        `${path}/Person ${i}.svg`,
        `<svg xmlns="http://www.w3.org/2000/svg" width="160" height="180"><rect width="160" height="180" fill="rgb(${i * 8},140,120)"/><circle r="30" cx="80" cy="70" fill="white"/></svg>`,
      )
    const id = `folder/${encodeURIComponent(name)}`
    await expect(page.getByRole('option', { name, exact: true })).toHaveCount(1, { timeout: 15000 })
    await page.getByLabel('Board', { exact: true }).selectOption(id)
    const previews = page.locator('.board-picker-preview img')
    await expect(previews).toHaveCount(4)
    await expect(previews.first()).toHaveAttribute(
      'src',
      new RegExp(`/boards/${encodeURIComponent(name)}/`),
    )
    await page.getByLabel('Board', { exact: true }).selectOption('ai-random')
    await expect(previews.first()).toHaveAttribute('src', /^\/fallback-faces\//)
    await page.getByLabel('Board', { exact: true }).selectOption(id)
    await expect(previews.first()).toHaveAttribute(
      'src',
      new RegExp(`/boards/${encodeURIComponent(name)}/`),
    )
    await page.getByLabel('What should your friend call you?').fill('Robin')
    await page.getByRole('button', { name: 'Create game', exact: true }).click()
    await expect(page.getByRole('heading', { name: 'Pick your person.', level: 1 })).toBeVisible()
    const stored = await page.evaluate(() => ({
      value: localStorage.getItem('sgw:preview2'),
      keys: Object.keys(localStorage),
      url: location.href,
    }))
    expect(stored.value, JSON.stringify(stored)).not.toBeNull()
    const state = JSON.parse(stored.value!).state
    expect(state.boardId).toBe(id)
    expect(state.board).toHaveLength(24)
    expect(new Set(state.board.map((c: { id: string }) => c.id)).size).toBe(24)
    expect(state.board.every((c: { name: string }) => /^Person \d+$/.test(c.name))).toBe(true)
    await expect
      .poll(() =>
        page
          .locator('.character-card img')
          .evaluateAll((images) =>
            images.every((image) => (image as HTMLImageElement).naturalWidth > 0),
          ),
      )
      .toBe(true)
  } finally {
    if (created) await rm(path, { recursive: true, force: true })
  }
})
