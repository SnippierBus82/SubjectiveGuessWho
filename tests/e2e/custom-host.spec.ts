import { expect, test } from '@playwright/test'

test('custom HTTP development host renders and creates a game without randomUUID', async ({
  page,
  baseURL,
}) => {
  const errors: string[] = []
  page.on('pageerror', (error) => errors.push(error.message))
  // Forward to Vite while retaining a real insecure browser origin; no hosts-file edit needed.
  await page.route('http://guesswho.local:5173/**', async (route) => {
    if (new URL(route.request().url()).pathname === '/src/lib/config.ts') {
      await route.fulfill({
        contentType: 'application/javascript',
        body: `export const config = {
          url: '', key: '', online: false, incomplete: false,
          captchaKey: '', captchaProvider: 'hcaptcha', appUrl: '', supportEmail: '',
        }`,
      })
      return
    }
    const target = new URL(route.request().url())
    const response = await route.fetch({ url: `${baseURL}${target.pathname}${target.search}` })
    await route.fulfill({ response })
  })
  await page.goto('http://guesswho.local:5173')
  expect(await page.evaluate(() => isSecureContext)).toBe(false)
  expect(await page.evaluate(() => typeof crypto.randomUUID)).toBe('undefined')
  await expect(page.getByRole('heading', { name: /Good questions/ })).toBeVisible()
  const ids = await page.evaluate(async () => {
    const modulePath = '/src/lib/platform.ts'
    const { newId } = await import(modulePath)
    return Array.from({ length: 100 }, () => newId() as string)
  })
  expect(new Set(ids).size).toBe(100)
  for (const id of ids) {
    expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
  }
  await page.getByLabel('What should your friend call you?').fill('Robin')
  await page.getByRole('button', { name: 'Create game' }).click()
  await expect(page.getByRole('heading', { name: /your person/ })).toBeVisible()
  expect(errors).toEqual([])
})
