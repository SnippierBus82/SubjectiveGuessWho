import { expect, test } from '@playwright/test'

test.skip(
  !process.env.E2E_SUPABASE_URL || !process.env.E2E_SUPABASE_PUBLISHABLE_KEY,
  'Needs an isolated migrated Supabase test project with anonymous auth enabled; CAPTCHA disabled for automated sign-ins.',
)
test('two independent browsers play a realtime game, reconnect, and rematch', async ({
  browser,
}) => {
  const contextA = await browser.newContext(),
    contextB = await browser.newContext()
  const alice = await contextA.newPage(),
    bob = await contextB.newPage()
  try {
    await alice.goto('http://127.0.0.1:5174/')
    await alice.getByLabel('What should your friend call you?').fill('Alice')
    await alice.getByRole('button', { name: 'Create game' }).click()
    const code = (await alice.locator('.room-code').textContent())!
    await bob.goto(`http://127.0.0.1:5174/?join=${code}`)
    await bob.getByLabel('What should your friend call you?').fill('Bob')
    await bob.getByRole('button', { name: 'Join', exact: true }).click()
    await expect(alice.locator('.opponent-pill')).toContainText('Bob')
    await alice.getByRole('button', { name: 'Amara, select as your secret' }).click()
    await bob.getByRole('button', { name: 'Milo, select as your secret' }).click()
    await alice.getByRole('button', { name: 'I’m ready' }).click()
    await bob.getByRole('button', { name: 'I’m ready' }).click()
    await expect(alice.getByRole('heading', { name: 'Read the room.' })).toBeVisible()
    await expect(bob.getByRole('heading', { name: 'Read the room.' })).toBeVisible()
    const asker = (await alice.getByRole('button', { name: 'I know who it is' }).isVisible())
      ? alice
      : bob
    const answerer = asker === alice ? bob : alice
    await asker.locator('#question-input').fill('Would they clap when the plane lands?')
    await asker.getByRole('button', { name: 'Ask question', exact: true }).click()
    await expect(answerer.locator('.current-question')).toContainText(
      'Would they clap when the plane lands?',
    )
    await answerer.getByRole('button', { name: 'YES', exact: true }).click()
    await expect(asker.locator('.history-entry').first()).toContainText('YES')
    await asker.getByRole('button', { name: 'Ruby, tap to eliminate', exact: true }).click()
    await asker.locator('#question-input').fill('Would they start a podcast?')
    await asker.reload()
    await expect(
      asker.getByRole('button', { name: 'Ruby, eliminated, tap to restore' }),
    ).toHaveAttribute('aria-pressed', 'true')
    await expect(asker.locator('#question-input')).toHaveValue('Would they start a podcast?')
    await expect(
      answerer.getByRole('button', { name: 'Ruby, tap to eliminate', exact: true }),
    ).toHaveAttribute('aria-pressed', 'false')
    await expect(asker.locator('.connection-pill')).toContainText('Connected')
    await asker.getByRole('button', { name: 'React 😂' }).click()
    await expect(answerer.locator('.floating-reaction')).toHaveText('😂')
    await answerer.getByRole('button', { name: 'I know who it is' }).click()
    await answerer
      .getByRole('button', { name: `${answerer === alice ? 'Milo' : 'Amara'}, make a final guess` })
      .click()
    await answerer.getByRole('button', { name: 'That’s my final guess' }).click()
    await expect(
      answerer.getByRole('heading', { name: 'You know the type.', exact: true }),
    ).toBeVisible()
    await expect(asker.locator('.revealed-characters')).toContainText('Amara')
    await expect(asker.locator('.revealed-characters')).toContainText('Milo')
    await alice.getByRole('button', { name: 'One more round?' }).click()
    await bob.getByRole('button', { name: 'One more round?' }).click()
    await expect(alice.getByRole('heading', { name: 'Who’s your person?' })).toBeVisible()
    await expect(bob.getByRole('heading', { name: 'Who’s your person?' })).toBeVisible()
    await expect(alice.locator('.secret-preview')).not.toContainText('Amara')
  } finally {
    await contextA.close()
    await contextB.close()
  }
})
