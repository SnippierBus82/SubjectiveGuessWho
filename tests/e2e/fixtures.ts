import { test as base, expect } from '@playwright/test'
import catalog from '../../.generated/boards.json' with { type: 'json' }
import names from '../../src/game/neutral-names.json' with { type: 'json' }
import { sample } from '../../src/game/board-model'

// Local images stand in for resolved provider bytes. Provider/download/storage behavior
// is exercised separately in folder-boards.test.ts, not by a live public API in CI.
export function previewResult(source = 'cache') {
  const selectedNames = sample(names, 24)
  return {
    source,
    characters: sample(catalog.cache, 24).map((face, i) => ({ ...face, name: selectedNames[i]! })),
  }
}
export const test = base.extend<{ boardBackend: void }>({
  boardBackend: [
    async ({ page }, use) => {
      await page.route('**/api/boards', async (route) => {
        const body = route.request().postDataJSON()
        if (body.operation === 'register') await route.fulfill({ json: { ok: true } })
        else if (body.operation === 'preview') await route.fulfill({ json: previewResult() })
        else
          await route.fulfill({
            status: 400,
            json: { error: 'Unexpected board operation in browser fixture.' },
          })
      })
      await use()
    },
    { auto: true },
  ],
})
export { expect }
