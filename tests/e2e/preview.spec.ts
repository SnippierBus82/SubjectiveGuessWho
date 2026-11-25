import type { Page } from '@playwright/test'
import { expect, test } from './fixtures'
import AxeBuilder from '@axe-core/playwright'
import { REACTION_CHOICES } from '../../src/game/types'
import { ROOM_PACES } from '../../src/game/timings'

// WebKit on Windows includes slower cold starts, reloads and accessibility scans.
test.setTimeout(90_000)
async function create(page: Page, unlimited = false) {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  await page.getByLabel('What should your friend call you?').fill('Robin')
  if (unlimited) {
    await page.locator('summary').filter({ hasText: 'Room settings' }).click()
    await page.getByRole('button', { name: 'Timeless', exact: true }).click()
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
  await expect(page.getByText('Round 1 · 1/2', { exact: true })).toBeVisible()
  if (!(await page.getByRole('heading', { name: 'Ask a question' }).isVisible()))
    await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.getByRole('heading', { name: 'Ask a question' })).toBeVisible()
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
  await expect(page.getByText('Free to play', { exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: 'How to play', exact: true })).toHaveCount(1)
  await expect(page.getByText('Your board', { exact: true })).toHaveCount(0)
  await expect(page.locator('meta[name="mobile-web-app-capable"]')).toHaveAttribute(
    'content',
    'yes',
  )
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
test('presets and advanced timers stay in sync and appear in the game menu', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/')
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  await expect(page.getByLabel('Board', { exact: true })).toBeVisible()
  const roomSettings = page.locator('.settings-disclosure > summary')
  await expect(roomSettings).toContainText('Normal')
  await roomSettings.click()
  const advanced = page.locator('.advanced-timers > summary')
  const writing = page.getByLabel('question time', { exact: true })
  await expect(writing).toBeHidden()
  await advanced.click()
  for (const [name, timings] of Object.entries(ROOM_PACES)) {
    const pace = page.getByRole('button', { name, exact: true })
    await pace.click()
    await expect(pace).toHaveAttribute('aria-pressed', 'true')
    await expect(roomSettings).toContainText(name)
    for (const [key, seconds] of Object.entries(timings)) {
      await expect(page.getByLabel(`${key} time`, { exact: true })).toHaveValue(
        String(seconds ?? 'unlimited'),
      )
    }
  }
  await writing.selectOption('60')
  await expect(roomSettings).toContainText('Custom')
  await expect(page.locator('.pace-buttons [aria-pressed="true"]')).toHaveCount(0)
  await page.getByLabel('answer time', { exact: true }).selectOption('15')
  await page.getByLabel('review time', { exact: true }).selectOption('30')
  await expect(roomSettings).toContainText('Fast')
  await expect(page.getByRole('button', { name: 'Fast', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByLabel('What should your friend call you?').fill('Robin')
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  await page.getByRole('button', { name: 'Game menu', exact: true }).click()
  const menu = page.getByRole('dialog')
  await expect(menu).toContainText('Room code:')
  await expect(menu).toContainText('Fast')
  await expect(menu.getByText('Write', { exact: true })).toBeHidden()
  await menu.getByText('Game details', { exact: true }).click()
  await expect(menu.getByText('Write', { exact: true })).toBeVisible()
  await expect(menu.getByText('1 min', { exact: true })).toBeVisible()
  await expect(menu.getByText('15s', { exact: true })).toBeVisible()
  await expect(menu.getByText('30s', { exact: true })).toBeVisible()
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
})
test('overlapping writing/review keeps submitted questions private, persists work, and rematches', async ({
  page,
}) => {
  await start(page, true)
  await expect(page.getByRole('timer')).toHaveCount(0)
  await page.locator('.character-card').nth(6).click()
  await page.getByLabel('Your question', { exact: true }).fill('Would they like camping?')
  await page.reload()
  await expect(page.getByLabel('Your question', { exact: true })).toHaveValue(
    'Would they like camping?',
  )
  await expect(page.locator('.character-card').nth(6)).toHaveAttribute('aria-pressed', 'true')
  await askAndAnswer(page)
  await expect(page.getByRole('heading', { name: 'Ask a question' })).toBeVisible()
  await page.getByLabel('Your question', { exact: true }).fill('Would they own a label maker?')
  await page.getByRole('button', { name: 'Ask question', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Question sent' })).toBeVisible()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.getByText('Would they own a label maker?', { exact: false })).toHaveCount(0)
  await expect(page.locator('.verdict-badge.yes')).toBeVisible()
  await page.getByRole('button', { name: 'Done reviewing' }).click()
  await expect(page.getByRole('button', { name: 'YES', exact: true })).toBeVisible()
  await page.getByRole('button', { name: 'NO', exact: true }).click()
  await expect(page.getByText('Round 2 · 1/2')).toBeVisible()
  await page.getByRole('button', { name: 'Final guess' }).click()
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
test('review shows one clock and keeps the board editable after marking it ready', async ({
  page,
}) => {
  await page.clock.install()
  await start(page)
  await expect(page.getByRole('timer')).toHaveAccessibleName(/^Your time:/)
  await askAndAnswer(page)
  const timer = page.getByRole('timer')
  await expect(timer).toHaveAccessibleName(/^Your time:/)
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.getByRole('heading', { name: 'Who can you rule out?' })).toBeVisible()
  await expect(page.getByText('Tap faces to cross them out')).toBeVisible()
  await expect(timer).toHaveCount(1)
  await expect(timer).toHaveAccessibleName(/^Your time: [456]\d seconds remaining$/)
  await expect(page.locator('.review-verdict p + .verdict-badge')).toHaveText('YES')
  await expect(page.locator('.review-verdict .verdict-badge')).toHaveCSS('font-size', '18px')
  const face = page.locator('.character-card').nth(4)
  await face.click()
  await expect(face).toHaveAttribute('aria-pressed', 'true')
  const otherName = await page.locator('.play-matchup b').last().innerText()
  await page.clock.fastForward(61000)
  await expect(timer).toHaveCount(1)
  await expect(timer).toHaveAccessibleName(new RegExp(`^${otherName}:`))
  await page.getByRole('button', { name: 'Done reviewing' }).click()
  await expect(page.getByRole('heading', { name: 'Review complete' })).toBeVisible()
  await expect(page.getByText('Tap faces to cross them out')).toBeVisible()
  await expect(timer).toHaveAccessibleName(new RegExp(`^${otherName}:`))
  await face.click()
  await expect(face).toHaveAttribute('aria-pressed', 'false')
})
test('emoji picker, local echo, mute preference, and enlarged secret are accessible', async ({
  page,
}) => {
  await page.clock.install()
  await start(page, true)
  for (const { emoji, label } of REACTION_CHOICES) {
    await page.getByRole('button', { name: 'Emoji', exact: true }).click()
    await expect(page.getByRole('dialog')).toBeVisible()
    await expect(page.getByRole('button', { name: /^Send reaction:/ })).toHaveCount(12)
    await page.getByRole('button', { name: `Send reaction: ${label}`, exact: true }).click()
    await expect(page.getByRole('dialog')).toHaveCount(0)
    await expect(page.locator('.reaction-float')).toHaveText(emoji)
    await page.clock.fastForward(3000)
  }
  await page.getByRole('button', { name: 'Emoji', exact: true }).click()
  await page.getByRole('button', { name: 'Mute reactions', exact: true }).click()
  await page.reload()
  await page.getByRole('button', { name: 'Emoji', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Unmute reactions', exact: true })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await page.getByRole('button', { name: 'Inspect', exact: true }).click()
  await page.locator('.character-card').nth(23).click()
  await expect(page.getByRole('dialog')).toBeVisible()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('dialog')).toHaveCount(0)
})
test('ideas move only on request and Previous restores the question and its category', async ({
  page,
}) => {
  await page.clock.install()
  await start(page)
  const draft = page.getByLabel('Your question', { exact: true })
  await draft.fill('My own question?')
  await page.getByRole('button', { name: 'Ideas', exact: true }).click()
  const idea = page.locator('.idea-text > span')
  const previous = page.getByRole('button', { name: 'Previous', exact: true })
  const category = page.getByLabel('Question category', { exact: true })
  const initial = await idea.innerText()
  const initialCategory = await category.inputValue()
  await expect(previous).toBeDisabled()
  await page.clock.fastForward(15000)
  await expect(idea).toHaveText(initial)
  await page.getByRole('button', { name: 'Shuffle', exact: true }).click()
  await expect(idea).not.toHaveText(initial)
  const shuffled = await idea.innerText()
  await category.selectOption({ index: 1 })
  await previous.click()
  await expect(category).toHaveValue(initialCategory)
  await expect(idea).toHaveText(shuffled)
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await expect(draft).toHaveValue('My own question?')
  await page.getByRole('button', { name: 'Ideas', exact: true }).click()
  await expect(idea).toHaveText(shuffled)
  await previous.click()
  await expect(idea).toHaveText(initial)
  await expect(previous).toBeDisabled()
  await page.locator('.idea-text').click()
  await expect(draft).toHaveValue(initial)
})
for (const [width, height] of [
  [360, 640],
  [390, 844],
  [768, 1024],
  [1440, 1000],
  [667, 375],
  [844, 390],
]) {
  test(`board and controls stay separate at ${width}×${height}`, async ({ page }) => {
    await page.setViewportSize({ width: width!, height: height! })
    await start(page)
    const board = await page.locator('.play-board-scroll').boundingBox(),
      action = await page.locator('.play-action').boundingBox()
    expect(board!.height).toBeGreaterThan(70)
    if (width! > 700 || width! > height!) {
      expect(board!.x + board!.width).toBeLessThanOrEqual(action!.x + 1)
      if (height! <= 500) {
        const firstFace = await page.locator('.character-card').first().boundingBox()
        expect(board!.height).toBeGreaterThanOrEqual(firstFace!.height + 2)
        expect(action!.height).toBeLessThanOrEqual(146)
      }
    } else {
      expect(board!.y + board!.height).toBeLessThanOrEqual(action!.y + 1)
    }
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
  await start(page, true)
  const axe = () => new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze()
  expect((await axe()).violations).toEqual([])
  await page.getByLabel('Your question', { exact: true }).focus()
  await page.setViewportSize({ width: 390, height: 440 })
  await expect(page.getByRole('button', { name: 'Ask question' })).toBeVisible()
  const draft = page.getByLabel('Your question', { exact: true })
  const question = 'Would they bring a karaoke machine to a quiet dinner with their neighbours?'
  await draft.fill(question + '!')
  await expect(page.locator('#question-count')).toHaveText('75/75')
  const face = page.locator('.character-card').first()
  await face.click()
  await expect(face).toHaveAttribute('aria-pressed', 'true')
  await expect(draft).toHaveValue(question)
  await expect(draft).toBeFocused()
  await page.getByRole('button', { name: 'Ask question' }).click()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await expect(page.locator('.answer-secret img')).toBeVisible()
  await expect(page.locator('.asked-question')).toHaveText(`“${question}”`)
  expect((await axe()).violations).toEqual([])
  await page.setViewportSize({ width: 667, height: 375 })
  const action = await page.locator('.play-action').boundingBox()
  const answers = await page.locator('.play-answer-buttons').boundingBox()
  expect(answers!.y + answers!.height).toBeLessThanOrEqual(action!.y + action!.height)
  await expect(page.getByRole('button', { name: 'YES', exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: 'NO', exact: true })).toBeInViewport()
  await page.setViewportSize({ width: 390, height: 844 })
  await page.getByRole('button', { name: 'Emoji', exact: true }).click()
  expect((await axe()).violations).toEqual([])
})
test('overlapping reactions keep their trajectory when the earlier one expires', async ({
  page,
}) => {
  await page.clock.install()
  await start(page, true)
  await page.clock.pauseAt(await page.evaluate(() => Date.now() + 10_000))
  const open = () => page.getByRole('button', { name: 'Emoji', exact: true }).click()
  await open()
  await page.getByRole('button', { name: 'Send reaction: Laugh', exact: true }).click()
  const reaction = page.locator('.reaction-float')
  const first = reaction.filter({ hasText: '😂' })
  const second = reaction.filter({ hasText: '❤️' })
  await expect(first).toHaveCount(1)
  await page.clock.runFor(1100)
  await open()
  await page.getByRole('button', { name: 'Send reaction: Love', exact: true }).click()
  await expect(reaction).toHaveCount(2)
  const lane = (locator: typeof reaction) =>
    locator.evaluate((el) => (el as HTMLElement).style.getPropertyValue('--reaction-x'))
  expect(await lane(second)).not.toBe(await lane(first))
  const style = await second.getAttribute('style')
  await page.clock.runFor(1800)
  await expect(first).toHaveCount(0)
  await expect(second).toHaveAttribute('style', style!)
})
test('missed writing time pauses without skipping and both seats can resume', async ({ page }) => {
  await page.setViewportSize({ width: 667, height: 375 })
  await page.clock.install()
  await start(page)
  await page.clock.fastForward(121000)
  await expect(page.getByRole('heading', { name: 'Game paused' })).toBeVisible()
  const end = page.getByRole('button', { name: 'End game', exact: true })
  await expect(end).toHaveCount(0)
  await page.clock.fastForward(120000)
  await expect(end).toBeVisible()
  const board = await page.locator('.play-board-scroll').boundingBox()
  const action = await page.locator('.play-action').boundingBox()
  const face = page.locator('.character-card').first()
  const firstFace = await face.boundingBox()
  expect(board!.height).toBeGreaterThanOrEqual(firstFace!.height + 2)
  expect(board!.x + board!.width).toBeLessThanOrEqual(action!.x + 1)
  expect(action!.height).toBeLessThanOrEqual(106)
  await face.click()
  await expect(face).toHaveAttribute('aria-pressed', 'true')
  const wait = page.getByRole('button', { name: 'Wait', exact: true })
  await wait.click()
  await expect(page.getByRole('status').filter({ hasText: /^Waiting for / })).toBeVisible()
  await page.getByRole('button', { name: 'Switch seat' }).click()
  await wait.click()
  await expect(page.getByText('Round 1 · 1/2')).toBeVisible()
})

test('muting filters only the opponent, keeps own emoji, and respects reduced motion', async ({
  page,
}) => {
  await page.clock.install()
  await page.emulateMedia({ reducedMotion: 'reduce' })
  await start(page)
  await page.getByRole('button', { name: 'Emoji', exact: true }).click()
  await page.getByRole('button', { name: 'Mute reactions', exact: true }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
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
  await page.getByRole('button', { name: 'Send reaction: Laugh', exact: true }).click()
  await expect(page.locator('.reaction-float')).toHaveCount(1)
  const motion = await page.locator('.reaction-float').evaluate((element) => {
    const css = getComputedStyle(element)
    return { name: css.animationName, duration: css.animationDuration, transform: css.transform }
  })
  expect(motion).toEqual({ name: 'feeling-fade', duration: '2.8s', transform: 'none' })
  await page.clock.fastForward(3000)
  await page.getByRole('button', { name: 'Emoji', exact: true }).click()
  await page.getByRole('button', { name: 'Unmute reactions', exact: true }).click()
  await page.getByRole('button', { name: 'Close', exact: true }).click()
  await sendOpponent()
  await expect(page.locator('.reaction-float')).toHaveCount(1)
})
