import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import AxeBuilder from '@axe-core/playwright'

// WebKit on Windows includes slower cold starts, reloads and accessibility scans.
test.setTimeout(90_000)
async function create(page: Page, unlimited = false) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  await page.getByLabel('What should your friend call you?').fill('Robin')
  if (unlimited) {
    await page.locator('summary').filter({ hasText: 'Room settings' }).click()
    for (const key of ['question', 'answer', 'review'])
      await page.getByLabel(`${key} time`, { exact: true }).selectOption('unlimited')
  }
  await page.getByRole('button', { name: 'Create game' }).click()
  await expect(page.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
}
async function start(page: Page, unlimited = false) {
  await create(page, unlimited)
  await page.locator('.character-card').nth(0).click()
  await page.getByRole('button', { name: 'I’m ready', exact: true }).click()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await page.locator('.character-card').nth(1).click()
  await page.getByRole('button', { name: 'I’m ready', exact: true }).click()
  if (!(await page.getByRole('heading', { name: 'Your next good question.' }).isVisible()))
    await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.getByRole('heading', { name: 'Your next good question.' })).toBeVisible()
}
async function askAndAnswer(page: Page) {
  await page.getByLabel('Your question', { exact: true }).fill('Would they start a podcast?')
  await page.getByRole('button', { name: 'Ask question', exact: true }).click()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.locator('.answer-secret')).toBeVisible()
  await page.getByRole('button', { name: 'YES', exact: true }).click()
}
test('home validates input and local preview rejects online invitation joins', async ({ page }) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  await page.getByRole('button', { name: 'Create game' }).click()
  await expect(page.getByText('Choose a name to play.')).toBeVisible()
  await page.getByRole('button', { name: 'Play', exact: true }).first().click()
  await page.getByRole('button', { name: 'Join game', exact: true }).click()
  await page.getByLabel('What should your friend call you?').fill('Robin')
  await page.getByLabel('7-character room code').fill('ABC1234')
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('configured Supabase backend')
})
test('overlapping writing/review keeps submitted questions private, persists work, and rematches', async ({
  page,
}) => {
  await start(page, true)
  await page.locator('.character-card').nth(6).click()
  await page.getByLabel('Your question', { exact: true }).fill('Would they like camping?')
  await page.reload()
  await expect(page.getByLabel('Your question', { exact: true })).toHaveValue(
    'Would they like camping?',
  )
  await expect(page.locator('.character-card').nth(6)).toHaveAttribute('aria-pressed', 'true')
  await askAndAnswer(page)
  await expect(page.getByRole('heading', { name: 'Your next good question.' })).toBeVisible()
  await page.getByLabel('Your question', { exact: true }).fill('Would they own a label maker?')
  await page.getByRole('button', { name: 'Ask question', exact: true }).click()
  await expect(page.getByText('Ready when they are.')).toBeVisible()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.getByText('Would they own a label maker?', { exact: false })).toHaveCount(0)
  await expect(page.locator('.verdict-badge.yes')).toBeVisible()
  await page.getByRole('button', { name: 'Done reviewing' }).click()
  await expect(page.getByRole('button', { name: 'YES', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'NO', exact: true }).click()
  await expect(page.getByText('ROUND 2 · QUESTION 1 OF 2')).toBeVisible()
  await page.getByRole('button', { name: 'I know who it is' }).click()
  const data = await page.evaluate(() => JSON.parse(localStorage.getItem('sgw:preview2')!))
  const otherSecret =
    data.secrets[data.state.game.activePlayer === 'preview-one' ? 'preview-two' : 'preview-one']
  const index = data.state.board.findIndex((c: { id: string }) => c.id === otherSecret)
  await page.locator('.character-card').nth(index).click()
  await page.getByRole('button', { name: 'Confirm final guess' }).click()
  await expect(page.getByRole('heading', { name: 'You called it.' })).toBeVisible()
  await expect(page.locator('.result-cast img')).toHaveCount(2)
  await page.getByRole('button', { name: 'Play again with a fresh cast' }).click()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await page.getByRole('button', { name: 'Play again with a fresh cast' }).click()
  await expect(page.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
  const fresh = await page.evaluate(() => JSON.parse(localStorage.getItem('sgw:preview2')!))
  expect(fresh.state.board).not.toEqual(data.state.board)
})
test('emoji picker, local echo, mute preference, and enlarged secret are accessible', async ({
  page,
}) => {
  await start(page)
  await page.getByRole('button', { name: 'Emoji', exact: true }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'React 😂', exact: true }).click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await expect(page.locator('.reaction-float')).toHaveCount(1)
  await page.getByRole('button', { name: 'Mute reactions', exact: true }).click()
  await page.reload()
  await expect(page.getByRole('button', { name: 'Unmute reactions', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Inspect', exact: true }).click()
  await page.locator('.character-card').nth(23).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('ideas rotate while idle, shuffle, and never overwrite typed questions', async ({ page }) => {
  await page.clock.install()
  await start(page)
  const initial = await page.locator('.idea-text>span').innerText()
  await page.clock.fastForward(5100)
  await expect(page.locator('.idea-text>span')).not.toHaveText(initial)
  await page.getByLabel('Your question', { exact: true }).fill('My own question?')
  await page.clock.fastForward(15000)
  await expect(page.getByLabel('Your question', { exact: true })).toHaveValue('My own question?')
  await page.getByRole('button', { name: 'Shuffle question ideas' }).click()
  await page.locator('.idea-text').click()
  await expect(page.getByLabel('Your question', { exact: true })).not.toHaveValue(
    'My own question?',
  )
})
for (const [width, height] of [
  [360, 640],
  [390, 844],
  [768, 1024],
  [1440, 1000],
  [844, 390],
]) {
  test(`board and controls stay separate at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! })
    await start(page)
    const board = await page.locator('.play-board-scroll').boundingBox(),
      action = await page.locator('.play-action').boundingBox()
    expect(board!.height).toBeGreaterThan(70)
    if (width! <= 700) expect(board!.y + board!.height).toBeLessThanOrEqual(action!.y + 1)
    else expect(board!.x + board!.width).toBeLessThanOrEqual(action!.x + 1)
    await page.locator('.character-card').last().click()
    await expect(page.locator('.character-card').last()).toHaveAttribute('aria-pressed', 'true')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    expect(
      await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight + 1),
    ).toBe(true)
  })
}
test('mobile answer shows the private portrait, with keyboard-safe composing and axe checks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await start(page)
  const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect((await axe()).violations).toEqual([])
  await page.getByLabel('Your question', { exact: true }).focus()
  await page.setViewportSize({ width: 390, height: 440 })
  await expect(page.getByRole('button', { name: 'Ask question' })).toBeVisible()
  await page.getByLabel('Your question', { exact: true }).fill('Would they camp?')
  await page.getByRole('button', { name: 'Ask question' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.locator('.answer-secret img')).toBeVisible()
  expect((await axe()).violations).toEqual([])
  await page.getByRole('button', { name: 'Emoji', exact: true }).click()
  expect((await axe()).violations).toEqual([])
})
test('missed writing time pauses without skipping and both seats can resume', async ({ page }) => {
  await page.clock.install()
  await start(page)
  await page.clock.fastForward(121000)
  await expect(page.getByRole('heading', { name: 'Let’s pause here.' })).toBeVisible()
  await page.getByRole('button', { name: 'I’m back · ready to continue' }).click()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await page.getByRole('button', { name: 'I’m back · ready to continue' }).click()
  await expect(page.getByText('ROUND 1 · QUESTION 1 OF 2')).toBeVisible()
})

test('muting filters only the opponent, keeps own emoji, and respects reduced motion', async ({
  page,
}) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await start(page)
  await page.getByRole('button', { name: 'Mute reactions', exact: true }).click()
  const sendOpponent = () =>
    page.evaluate(async () => {
      const path = '/src/services/index.ts'
      const loaded = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .filter((name) => new URL(name).pathname === path)
        .at(-1)
      const { getService } = await import(loaded ?? path)
      const saved = JSON.parse(localStorage.getItem('sgw:preview2')!)
      const other = saved.seat === 0 ? 'preview-two' : 'preview-one'
      await (await getService()).react('👀', other)
    })
  await sendOpponent()
  await expect(page.locator('.reaction-float')).toHaveCount(0)
  await page.clock.fastForward(1100)
  await page.getByRole('button', { name: 'Emoji', exact: true }).click()
  await page.getByRole('button', { name: 'React 😂', exact: true }).click()
  await expect(page.locator('.reaction-float')).toHaveCount(1)
  const motion = await page.locator('.reaction-float').evaluate((element) => {
    const css = getComputedStyle(element)
    return { name: css.animationName, duration: css.animationDuration, transform: css.transform }
  })
  expect(motion).toEqual({ name: 'feeling-fade', duration: '2.8s', transform: 'none' })
  await page.clock.fastForward(3000)
  await page.getByRole('button', { name: 'Unmute reactions', exact: true }).click()
  await sendOpponent()
  await expect(page.locator('.reaction-float')).toHaveCount(1)
})
