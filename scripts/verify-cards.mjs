import { chromium } from '@playwright/test'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const artifactDir = '/Users/taboj/.gemini/antigravity/brain/92e35c04-e174-4dc4-9c5d-af4b4583f64a'

async function run() {
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
  })
  const page = await context.newPage()

  await page.addInitScript(() => {
    localStorage.setItem('casa_tabor_profile_session', JSON.stringify({
      memberId: 'family-jake',
      memberName: 'Jake',
      token: 'mock-session-token',
    }))
    localStorage.setItem('casa-theme-auto-midnight', '0')
    localStorage.setItem('casa-theme-force-midnight', '0')
    localStorage.setItem('casa-calendar-view', 'today')
  })

  const port = 5173
  console.log(`Navigating to http://localhost:${port}/calendar...`)
  try {
    await page.goto(`http://localhost:${port}/calendar`, { waitUntil: 'networkidle', timeout: 10000 })
  } catch (err) {
    await page.goto(`http://localhost:5174/calendar`, { waitUntil: 'networkidle', timeout: 10000 })
  }

  await page.waitForTimeout(1000)

  // Click Day segment button
  const daySegment = page.locator('[data-segment-value="today"]')
  if (await daySegment.isVisible()) {
    console.log('Clicking Day segment...')
    await daySegment.click()
    await page.waitForTimeout(1000)
  }

  const dayViewPath = resolve(artifactDir, 'day_view_option3.png')
  await page.screenshot({ path: dayViewPath, fullPage: false })
  console.log(`Saved Day View screenshot to: ${dayViewPath}`)

  // Click Stacked segment
  const stackedSegment = page.locator('[data-segment-value="stacked"]')
  if (await stackedSegment.isVisible()) {
    console.log('Clicking Stacked segment...')
    await stackedSegment.click()
    await page.waitForTimeout(1000)
  }
  const stackedViewPath = resolve(artifactDir, 'stacked_view_option3.png')
  await page.screenshot({ path: stackedViewPath, fullPage: false })
  console.log(`Saved Stacked View screenshot to: ${stackedViewPath}`)

  // Mobile viewport for Day View
  await page.setViewportSize({ width: 390, height: 844 })
  if (await daySegment.isVisible()) {
    await daySegment.click()
    await page.waitForTimeout(1000)
  }
  const mobileViewPath = resolve(artifactDir, 'mobile_day_view_option3.png')
  await page.screenshot({ path: mobileViewPath, fullPage: false })
  console.log(`Saved Mobile Day View screenshot to: ${mobileViewPath}`)

  await browser.close()
  console.log('Verification completed successfully.')
}

run().catch((err) => {
  console.error('Error during verification:', err)
  process.exit(1)
})
