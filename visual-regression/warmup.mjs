import { chromium } from '@playwright/test'
import { routeFonts } from './fontCache.mjs'

// Before the guard: open each fixture once, untimed, so the dev server has compiled the app.
// Otherwise the first test pays for that compile, and next to a ship's build it could take
// longer than a test's 20 s wait (a flaky first test, 2026-09-26).
export default async function warmup(config) {
  const baseURL = config.projects[0].use.baseURL
  const browser = await chromium.launch()
  const page = await browser.newPage()
  await routeFonts(page)
  for (const path of ['/__wall-fixture?at=2026-09-25T07:12:00', '/__phone-fixture?at=2026-09-25T07:12:00&viewer=jake-id']) {
    await page.goto(`${baseURL}${path}`, { timeout: 180_000 })
    await page.waitForSelector('[data-testid$="-fixture"]', { timeout: 180_000 })
  }
  await browser.close()
}
