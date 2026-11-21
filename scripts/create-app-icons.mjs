import { chromium } from '@playwright/test'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
const svg = await readFile(new URL('../public/favicon.svg', import.meta.url), 'utf8')
const browser = await chromium.launch()
try {
  for (const [name, size] of [
    ['icon-192', 192],
    ['icon-512', 512],
    ['apple-touch-icon', 180],
  ]) {
    const page = await browser.newPage({
      viewport: { width: size, height: size },
      deviceScaleFactor: 1,
    })
    await page.setContent(
      `<style>body{margin:0;background:#fff8eb;display:grid;place-items:center;width:100vw;height:100vh}svg{width:76%;height:76%}</style>${svg}`,
    )
    await page.screenshot({
      path: fileURLToPath(new URL(`../public/${name}.png`, import.meta.url)),
    })
    await page.close()
  }
} finally {
  await browser.close()
}
