import { expect, test, type Page } from '@playwright/test'
import AxeBuilder from '@axe-core/playwright'
import { mkdir } from 'node:fs/promises'

async function createPreview(page: Page) {
  await page.goto('/')
  await page.getByLabel('What should your friend call you?').fill('Robin')
  await page.getByRole('button', { name: 'Create game' }).click()
  await expect(page.getByRole('heading', { name: 'Who’s your person?' })).toBeVisible()
}
async function startPlaying(page: Page) {
  await createPreview(page)
  await page.getByRole('button', { name: 'Amara, select as your secret' }).click()
  await page.getByRole('button', { name: 'I’m ready' }).click()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.locator('.secret-preview')).not.toContainText('Amara')
  await page.getByRole('button', { name: 'Milo, select as your secret' }).click()
  await page.getByRole('button', { name: 'I’m ready' }).click()
  await expect(page.getByRole('heading', { name: 'Read the room.' })).toBeVisible()
}
async function becomeAsker(page: Page) {
  if (!(await page.getByRole('button', { name: 'I know who it is' }).isVisible()))
    await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.getByRole('button', { name: 'I know who it is' })).toBeVisible()
}
test('home validates nicknames and honestly rejects online joins without a backend', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create game' }).click()
  await expect(page.getByText('First, give your friend a name to judge.')).toBeVisible()
  await page.getByLabel('What should your friend call you?').fill('Robin')
  await page.getByRole('button', { name: 'Join game' }).click()
  await page.getByLabel('7-character room code').fill('ABC1234')
  await page.getByRole('button', { name: 'Join', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('need a configured Supabase backend')
})
test('two local seats ask, answer, restore private eliminations and drafts, finish, and rematch', async ({
  page,
}) => {
  await startPlaying(page)
  const card = page.getByRole('button', { name: 'Ruby, tap to eliminate', exact: true })
  await card.click()
  await expect(
    page.getByRole('button', { name: 'Ruby, eliminated, tap to restore' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page
    .getByLabel('YOUR NEXT QUESTION', { exact: true })
    .or(page.getByLabel('YOUR QUESTION', { exact: true }))
    .fill('Would they complain about slow WiFi?')
  await page.reload()
  await expect(page.locator('#question-input')).toHaveValue('Would they complain about slow WiFi?')
  await expect(
    page.getByRole('button', { name: 'Ruby, eliminated, tap to restore' }),
  ).toHaveAttribute('aria-pressed', 'true')
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(
    page.getByRole('button', { name: 'Ruby, tap to eliminate', exact: true }),
  ).toHaveAttribute('aria-pressed', 'false')
  await becomeAsker(page)
  await page.locator('#question-input').fill('Would they start a podcast?')
  await page.getByRole('button', { name: 'Ask question', exact: true }).click()
  await expect(page.locator('#question-input')).toHaveValue('')
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.locator('.current-question')).toContainText('Would they start a podcast?')
  await page.getByRole('button', { name: 'YES', exact: true }).click()
  await expect(page.locator('.history-entry').first()).toContainText('YES')
  await page.getByRole('button', { name: 'React 😂' }).click()
  await expect(page.locator('.floating-reaction')).toHaveText('😂')
  await page.getByRole('button', { name: 'I know who it is' }).click()
  await page.getByRole('button', { name: 'Cleo, make a final guess' }).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.getByRole('button', { name: 'That’s my final guess' }).click()
  await expect(page.locator('.result-description')).toContainText(
    'A bold guess. A different person.',
  )
  await expect(page.locator('.revealed-characters')).toContainText('Amara')
  await expect(page.locator('.revealed-characters')).toContainText('Milo')
  await page.getByRole('button', { name: 'One more round?' }).click()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await page.getByRole('button', { name: 'One more round?' }).click()
  await expect(page.getByRole('heading', { name: 'Who’s your person?' })).toBeVisible()
  await expect(page.locator('.secret-preview')).not.toContainText('Milo')
})
for (const width of [360, 390, 768, 1440]) {
  test(`comfortable home and playable board at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: width < 700 ? 844 : 1000 })
    await page.goto('/')
    await page.evaluate(() => document.fonts.ready)
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Good questions.')
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await mkdir('.local/previews', { recursive: true })
    await page.screenshot({ path: `.local/previews/home-${width}.png`, fullPage: true })
    await startPlaying(page)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
    await expect(page.locator('.character-card')).toHaveCount(24)
    await page.getByRole('button', { name: 'Arlo, tap to eliminate', exact: true }).click()
    await expect(
      page.getByRole('button', { name: 'Arlo, eliminated, tap to restore' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await page.evaluate(() => scrollTo(0, 0))
    await page.screenshot({ path: `.local/previews/game-${width}.png`, fullPage: true })
    const controls = page.locator('.turn-panel')
    await expect(controls).toBeVisible()
    const box = await controls.boundingBox()
    if (width < 700) expect(box!.x + box!.width).toBeLessThanOrEqual(width)
  })
}
test('home, lobby, game and final guess pass WCAG A/AA automated accessibility checks', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.goto('/')
  await page.evaluate(() => document.fonts.ready)
  let audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
  await createPreview(page)
  audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
  await page.getByRole('button', { name: 'Amara, select as your secret' }).click()
  await page.getByRole('button', { name: 'I’m ready' }).click()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await page.getByRole('button', { name: 'Milo, select as your secret' }).click()
  await page.getByRole('button', { name: 'I’m ready' }).click()
  await becomeAsker(page)
  audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
  await page.locator('#question-input').fill('Would they start a podcast?')
  await page.getByRole('button', { name: 'Ask question', exact: true }).click()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
  await page.getByRole('button', { name: 'YES', exact: true }).click()
  await page.getByRole('button', { name: 'I know who it is' }).click()
  await page.getByRole('button', { name: 'Cleo, make a final guess' }).click()
  audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
  await page.getByRole('button', { name: 'That’s my final guess' }).click()
  await expect(page.locator('.result-description')).toBeVisible()
  audit = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect(audit.violations).toEqual([])
})
