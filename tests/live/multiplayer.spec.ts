import { expect, test } from '@playwright/test'
test.skip(
  !process.env.E2E_SUPABASE_URL ||
    !process.env.E2E_SUPABASE_PUBLISHABLE_KEY ||
    !process.env.E2E_SUPABASE_SECRET_KEY,
  'Needs an isolated migrated Supabase project with anonymous Auth enabled and CAPTCHA disabled for automation.',
)
test('two independent players review, answer with secret portraits, reconnect, react and rematch', async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext(),
    alice = await ca.newPage(),
    bob = await cb.newPage()
  try {
    await alice.goto('/')
    await alice.getByRole('button', { name: 'Create game', exact: true }).click()
    await alice.getByLabel('What should your friend call you?').fill('Alice')
    await alice.getByRole('button', { name: 'Create game' }).click()
    await expect(alice.getByText('Room code:', { exact: true })).toBeVisible()
    const code = await alice.locator('.play-room-code').innerText()
    await bob.goto(`/?join=${code}`)
    await bob.getByLabel('What should your friend call you?').fill('Bob')
    await bob.getByRole('button', { name: 'Join', exact: true }).click()
    const aliceSecret = await alice.locator('.character-card').nth(0).innerText(),
      bobSecret = await bob.locator('.character-card').nth(1).innerText()
    await alice.locator('.character-card').nth(0).click()
    await bob.locator('.character-card').nth(1).click()
    await alice.getByRole('button', { name: 'I’m ready', exact: true }).click()
    await bob.getByRole('button', { name: 'I’m ready', exact: true }).click()
    await expect(alice.getByText('Round 1 · 1/2')).toBeVisible()
    const asker = (await alice.getByRole('button', { name: 'Final guess' }).isVisible())
        ? alice
        : bob,
      answerer = asker === alice ? bob : alice
    await asker
      .getByLabel('Your question', { exact: true })
      .fill('Would they clap when the plane lands?')
    await asker.getByRole('button', { name: 'Ask question' }).click()
    await expect(answerer.locator('.answer-secret')).toContainText(
      answerer === alice ? aliceSecret : bobSecret,
    )
    await expect(answerer.locator('.asked-question')).toContainText(
      'Would they clap when the plane lands?',
    )
    await asker.locator('.character-card').nth(6).click()
    await asker.reload()
    await expect(asker.locator('.character-card').nth(6)).toHaveAttribute('aria-pressed', 'true')
    await answerer.getByRole('button', { name: 'YES', exact: true }).click()
    await expect(asker.locator('.verdict-badge')).toContainText('YES')
    await answerer.getByLabel('Your question', { exact: true }).fill('Would they start a podcast?')
    await answerer.reload()
    await expect(answerer.getByLabel('Your question', { exact: true })).toHaveValue(
      'Would they start a podcast?',
    )
    await answerer.getByRole('button', { name: 'Ask question' }).click()
    await expect(asker.getByText('Would they start a podcast?', { exact: false })).toHaveCount(0)
    await asker.getByRole('button', { name: 'Done reviewing' }).click()
    await expect(asker.locator('.asked-question')).toContainText('Would they start a podcast?')
    await asker.getByRole('button', { name: 'NO', exact: true }).click()
    await expect(answerer.locator('.verdict-badge')).toContainText('NO')
    await asker.getByRole('button', { name: 'Emoji', exact: true }).click()
    await asker.getByRole('button', { name: 'Send reaction: Laugh', exact: true }).click()
    await expect(answerer.locator('.reaction-float')).toHaveCount(1)
    await asker.getByRole('button', { name: 'Final guess' }).click()
    await asker
      .getByRole('button', {
        name: `${asker === alice ? bobSecret : aliceSecret}, make a final guess`,
        exact: true,
      })
      .click()
    await asker.getByRole('button', { name: 'Confirm final guess' }).click()
    await expect(asker.getByRole('heading', { name: 'You called it.' })).toBeVisible()
    await expect(answerer.locator('.result-cast img')).toHaveCount(2)
    await alice.getByRole('button', { name: 'Play again with a fresh cast' }).click()
    await bob.getByRole('button', { name: 'Play again with a fresh cast' }).click()
    await expect(alice.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
    await expect(bob.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
  } finally {
    await ca.close()
    await cb.close()
  }
})
test('Find a player matches two waiting identities without exposing the queue', async ({
  browser,
}) => {
  const ca = await browser.newContext(),
    cb = await browser.newContext(),
    a = await ca.newPage(),
    b = await cb.newPage()
  try {
    await a.goto('/')
    await a.getByRole('button', { name: /Find a player/ }).click()
    await a.getByLabel('What should your friend call you?').fill('Match Alice')
    await a.getByRole('button', { name: /Find a player/ }).click()
    await expect(a.getByRole('status')).toContainText('Looking for another player')
    await b.goto('/')
    await b.getByRole('button', { name: /Find a player/ }).click()
    await b.getByLabel('What should your friend call you?').fill('Match Bob')
    await b.getByRole('button', { name: /Find a player/ }).click()
    await expect(a.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
    await expect(b.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
    await a.getByRole('button', { name: 'Game menu', exact: true }).click()
    await b.getByRole('button', { name: 'Game menu', exact: true }).click()
    expect(await a.locator('.menu-room-label strong').innerText()).toBe(
      await b.locator('.menu-room-label strong').innerText(),
    )
    await b.getByRole('button', { name: 'Keep playing', exact: true }).click()
    await a.getByRole('button', { name: 'Leave game', exact: true }).click()
    await a.getByRole('button', { name: 'Yes, leave game', exact: true }).click()
    await expect(b.getByRole('heading', { name: 'Game ended.' })).toBeVisible()
  } finally {
    await ca.close()
    await cb.close()
  }
})
