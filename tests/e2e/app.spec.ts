import type { Page } from '@playwright/test'
import { test, expect } from './fixtures'
import AxeBuilder from '@axe-core/playwright'

// Includes cold WebKit startup, profile/room reloads, multi-context Auth and axe.
test.setTimeout(120_000)

test('profile, boards and play form a simple mobile app, with persistent player choices', async ({
  page,
}) => {
  await page.setViewportSize({ width: 360, height: 780 })
  await page.goto('/')
  await expect(page.getByRole('heading', { name: 'Let’s play.' })).toBeVisible()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await page.getByLabel('Player name', { exact: true }).fill('Jamie')
  await page.getByRole('button', { name: 'Avatar 3', exact: true }).click()
  await page.getByRole('button', { name: 'Save profile', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Profile saved')
  await page.reload()
  await expect(page.getByLabel('Player name', { exact: true })).toHaveValue('Jamie')
  await expect(page.getByRole('button', { name: 'Avatar 3' })).toHaveAttribute(
    'aria-pressed',
    'true',
  )
  await page.getByRole('button', { name: 'Boards', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My boards.' })).toBeVisible()
  await page.getByRole('button', { name: 'Play with Random AI faces', exact: true }).click()
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  await expect(page.getByLabel('What should your friend call you?')).toHaveValue('Jamie')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  expect(
    (await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()).violations,
  ).toEqual([])
})

test('a game locks app navigation until a confirmed leave, including browser Back and reload', async ({
  page,
}) => {
  await page.goto('/')
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  await page.getByLabel('What should your friend call you?').fill('Robin')
  await page.getByRole('button', { name: 'Create game', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
  const roomUrl = page.url()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toHaveCount(0)
  await page.getByRole('button', { name: 'Subjective Guess Who home' }).click()
  await expect(page.getByRole('dialog')).toContainText('Game menu')
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click()
  await page.goBack()
  await expect(page).toHaveURL(roomUrl)
  await expect(page.getByRole('dialog')).toContainText('Game menu')
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click()
  await page.goto('/?page=profile')
  await expect(page).toHaveURL(roomUrl)
  await expect(page.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
  await page.getByRole('button', { name: 'Game menu', exact: true }).click()
  await page.getByRole('button', { name: 'Leave game', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Leave this game?' })).toBeVisible()
  await page.getByRole('button', { name: 'Keep playing', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Pick your person.' })).toBeVisible()
  await page.getByRole('button', { name: 'Game menu', exact: true }).click()
  await page.getByRole('button', { name: 'Leave game', exact: true }).click()
  await page.getByRole('button', { name: 'Yes, leave game', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Let’s play.' })).toBeVisible()
  await expect(page.getByRole('navigation', { name: 'Main navigation' })).toBeVisible()
  expect(await page.evaluate(() => localStorage.getItem('sgw:active-room'))).toBeNull()
  await page.getByRole('button', { name: 'Profile', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'My profile.' })).toBeVisible()
})

const password = 'A test password 123!'
function authState(anonymous = false) {
  return {
    password,
    user: {
      id: '20000000-0000-4000-8000-000000000001',
      aud: 'authenticated',
      role: 'authenticated',
      email: anonymous ? '' : 'jamie@example.test',
      is_anonymous: anonymous,
      email_confirmed_at: anonymous ? null : new Date().toISOString(),
      created_at: new Date().toISOString(),
      app_metadata: { provider: anonymous ? 'anonymous' : 'email' },
      user_metadata: { sgw_profile: { name: 'Jamie', avatar: '🐸', boardId: 'ai-random' } },
      new_email: '',
    },
    writes: [] as Record<string, unknown>[],
  }
}
function session(state: ReturnType<typeof authState>) {
  const payload = Buffer.from(
    JSON.stringify({
      sub: state.user.id,
      role: 'authenticated',
      exp: Math.floor(Date.now() / 1000) + 3600,
    }),
  ).toString('base64url')
  return {
    access_token: `eyJhbGciOiJIUzI1NiJ9.${payload}.test`,
    refresh_token: 'test-refresh-token',
    token_type: 'bearer',
    expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600,
    user: state.user,
  }
}
async function mockAuth(page: Page, state: ReturnType<typeof authState>) {
  await page.route('**/src/lib/config.ts', (route) =>
    route.fulfill({
      contentType: 'application/javascript',
      body: `export const config=${JSON.stringify({ online: true, incomplete: false, url: 'https://profile-test.supabase.co', key: 'public-test-key', captchaKey: '', captchaProvider: 'hcaptcha', appUrl: '', supportEmail: '' })}`,
    }),
  )
  await page.route('https://profile-test.supabase.co/**', async (route) => {
    const url = new URL(route.request().url())
    const body = route.request().postDataJSON() as Record<string, any> | null
    if (url.pathname.endsWith('/signup')) {
      state.user.email = body!.email
      state.user.user_metadata = body!.data
      state.password = body!.password
      return route.fulfill({
        json: { user: { ...state.user, email_confirmed_at: null }, session: null },
      })
    }
    if (url.pathname.endsWith('/token')) {
      if (body?.password !== state.password)
        return route.fulfill({
          status: 400,
          json: { code: 'invalid_credentials', msg: 'Invalid login credentials' },
        })
      return route.fulfill({ json: session(state) })
    }
    if (url.pathname.endsWith('/verify')) {
      if (body?.token !== '12345678')
        return route.fulfill({ status: 403, json: { code: 'otp_expired', msg: 'Token expired' } })
      state.user.email = state.user.new_email || state.user.email
      state.user.is_anonymous = false
      state.user.email_confirmed_at = new Date().toISOString()
      return route.fulfill({ json: session(state) })
    }
    if (url.pathname.endsWith('/user')) {
      if (route.request().method() === 'PUT') {
        state.writes.push(body!)
        if (body?.data) state.user.user_metadata = { ...state.user.user_metadata, ...body.data }
        if (body?.password) state.password = body.password
        if (body?.email) state.user.new_email = body.email
      }
      return route.fulfill({ json: state.user })
    }
    if (url.pathname.endsWith('/recover') || url.pathname.endsWith('/logout'))
      return route.fulfill({ json: {} })
    return route.abort()
  })
}

test('email and password accounts confirm email, sync profiles across devices, and log out safely', async ({
  page,
  browser,
}) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const remote = authState()
  await mockAuth(page, remote)
  await page.goto('/?page=profile')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByLabel('Player name', { exact: true }).fill('Jamie')
  await page.getByLabel('Email', { exact: true }).fill(remote.user.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible()
  await page.getByLabel('Email code').fill('00000000')
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page.getByRole('alert')).toContainText('invalid or expired')
  await page.getByLabel('Email code').fill('12345678')
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page.getByText('Account connected', { exact: true })).toBeVisible()
  const otherContext = await browser.newContext()
  try {
    const other = await otherContext.newPage()
    await mockAuth(other, remote)
    await other.goto('/?page=profile')
    await other.getByRole('button', { name: 'Log in', exact: true }).click()
    await other.getByLabel('Email', { exact: true }).fill(remote.user.email)
    await other.getByLabel('Password', { exact: true }).fill('wrong password')
    await other.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(other.getByRole('alert')).toContainText('Check your email and password')
    await other.getByLabel('Password', { exact: true }).fill(password)
    await other.getByRole('button', { name: 'Log in', exact: true }).click()
    await expect(other.getByLabel('Player name', { exact: true })).toHaveValue('Jamie')
    await other.getByLabel('Player name', { exact: true }).fill('Jamie Plays')
    await other.getByRole('button', { name: 'Save profile', exact: true }).click()
    await expect(other.getByRole('status')).toContainText('synced')
    await page.reload()
    await expect(page.getByLabel('Player name', { exact: true })).toHaveValue('Jamie Plays')
    expect(await other.evaluate(() => JSON.stringify(localStorage))).not.toContain(password)
    await other.getByRole('button', { name: 'Log out', exact: true }).click()
    await expect(other.getByText('Guest player', { exact: true })).toBeVisible()
    await expect(other.getByLabel('Player name', { exact: true })).toHaveValue('')
  } finally {
    await otherContext.close()
  }
})

test('password recovery verifies the reset code before allowing a new password', async ({
  page,
}) => {
  const remote = authState()
  await mockAuth(page, remote)
  await page.goto('/?page=profile')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('button', { name: 'Forgot password?', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(remote.user.email)
  await page.getByRole('button', { name: 'Send reset code' }).click()
  await expect(page.getByText('If an account uses that email, we sent a reset code.')).toBeVisible()
  await page.getByLabel('Email code').fill('12345678')
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page.getByRole('heading', { name: 'Set your password.' })).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill('A fresh password 456!')
  await page.getByRole('button', { name: 'Save password', exact: true }).click()
  await expect(page.getByText('Account connected', { exact: true })).toBeVisible()
  expect(remote.password).toBe('A fresh password 456!')
})

test('email and password changes require the current password and keep email pending confirmation', async ({
  page,
}) => {
  const remote = authState()
  await mockAuth(page, remote)
  await page.goto('/?page=profile')
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill(remote.user.email)
  await page.getByLabel('Password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Log in', exact: true }).click()
  await page.getByRole('button', { name: 'Email & password', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('new@example.test')
  await page.getByLabel('Current password', { exact: true }).fill('not the password')
  await page.getByLabel('New password', { exact: true }).fill('A different password 789!')
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('current password')
  await page.getByLabel('Current password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Save changes', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('Check both email inboxes')
  await expect(page.getByLabel('Email', { exact: true })).toHaveValue('jamie@example.test')
  expect(remote.user.new_email).toBe('new@example.test')
  expect(remote.password).toBe('A different password 789!')
  expect(remote.writes.some((body) => body.current_password === password)).toBe(true)
})

test('a guest account keeps its user ID and adds a password only after email verification', async ({
  page,
}) => {
  const remote = authState(true)
  const guestId = remote.user.id
  await mockAuth(page, remote)
  await page.addInitScript(
    (value) => localStorage.setItem('sgw-auth', JSON.stringify(value)),
    session(remote),
  )
  await page.goto('/?page=profile')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await page.getByLabel('Email', { exact: true }).fill('jamie@example.test')
  await page.getByRole('button', { name: 'Create account', exact: true }).click()
  await expect(page.getByRole('heading', { name: 'Check your email.' })).toBeVisible()
  expect(remote.writes.every((body) => !body.password)).toBe(true)
  await page.getByLabel('Email code').fill('12345678')
  await page.getByRole('button', { name: 'Confirm code' }).click()
  await expect(page.getByRole('heading', { name: 'Set your password.' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('heading', { name: 'Set your password.' })).toBeVisible()
  await page.getByLabel('New password', { exact: true }).fill(password)
  await page.getByRole('button', { name: 'Save password', exact: true }).click()
  await expect(page.getByText('Account connected', { exact: true })).toBeVisible()
  expect(remote.user.id).toBe(guestId)
  expect(remote.writes.some((body) => body.password === password)).toBe(true)
})
