import { expect, test } from '@playwright/test'

for (const provider of ['hcaptcha', 'turnstile']) {
  test(`${provider} gates game creation on a valid, unexpired token`, async ({ page }) => {
    // Exercise the real component without sending challenges or tokens to external services.
    await page.route('**/*.supabase.co/**', (route) => route.abort())
    await page.route('**/src/lib/config.ts', (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `export const config = ${JSON.stringify({
          url: 'https://captcha-test.supabase.co',
          key: 'public-test-key',
          online: true,
          incomplete: false,
          captchaProvider: provider,
          captchaKey: 'public-test-site-key',
          appUrl: '',
          supportEmail: '',
        })}`,
      }),
    )
    const scriptUrl =
      provider === 'hcaptcha'
        ? 'https://js.hcaptcha.com/1/api.js*'
        : 'https://challenges.cloudflare.com/turnstile/v0/api.js*'
    await page.route(scriptUrl, (route) =>
      route.fulfill({
        contentType: 'application/javascript',
        body: `
          window.${provider} = {
            render(container, options) {
              if (options.sitekey !== 'public-test-site-key') throw new Error('Wrong site key');
              container.textContent = '${provider} challenge';
              for (const event of ['callback', 'expired-callback', 'error-callback']) {
                window.addEventListener('captcha-test-' + event, () => options[event]('test-token'));
              }
              return '0';
            },
            remove() {},
          };
          window.onGameCaptchaLoaded();
        `,
      }),
    )
    await page.goto('/')
    await page.getByRole('button', { name: 'Create game', exact: true }).click()
    await expect(page.getByText(`${provider} challenge`, { exact: true })).toBeVisible()
    const create = page.getByRole('button', { name: 'Create game' })
    await expect(create).toBeDisabled()
    await page.evaluate(() => window.dispatchEvent(new Event('captcha-test-callback')))
    await expect(create).toBeEnabled()
    await page.evaluate(() => window.dispatchEvent(new Event('captcha-test-expired-callback')))
    await expect(create).toBeDisabled()
    await page.evaluate(() => window.dispatchEvent(new Event('captcha-test-callback')))
    await expect(create).toBeEnabled()
    await page.evaluate(() => window.dispatchEvent(new Event('captcha-test-error-callback')))
    await expect(create).toBeDisabled()
    await expect(page.getByRole('alert')).toContainText('Connection check unavailable')
    await page.evaluate(() => window.dispatchEvent(new Event('captcha-test-callback')))
    await expect(create).toBeEnabled()
    await expect(page.getByRole('alert')).toHaveCount(0)
    await page.getByRole('button', { name: 'Profile', exact: true }).click()
    await page.getByRole('button', { name: 'Create account', exact: true }).click()
    const account = page.getByRole('button', { name: 'Create account', exact: true })
    await expect(account).toBeDisabled()
    await page.evaluate(() => window.dispatchEvent(new Event('captcha-test-callback')))
    await expect(account).toBeEnabled()
    await page.evaluate(() => window.dispatchEvent(new Event('captcha-test-expired-callback')))
    await expect(account).toBeDisabled()
  })
}
