import { expect, test } from '@playwright/test'

test('matches the approved design-system baseline', async ({ page }, testInfo) => {
  const { theme, density } = testInfo.project.metadata

  await page.addInitScript((selectedTheme) => {
    localStorage.clear()
    localStorage.setItem('casa-theme-auto-midnight', '0')
    localStorage.setItem('casa-theme-force-midnight', selectedTheme === 'midnight' ? '1' : '0')
    localStorage.setItem('casa-design-font-scale', '1')
  }, theme)

  await page.goto(`/__visual-regression?density=${density}`)
  await expect(page.getByTestId('visual-regression-fixture')).toBeVisible()
  await page.evaluate(() => document.fonts.ready)

  if (theme === 'midnight') {
    const headingColors = await page.locator('h1, h2, h3').first().evaluate((heading) => ({
      actual: getComputedStyle(heading).color,
      expected: getComputedStyle(document.body).color,
    }))
    expect(headingColors.actual).toBe(headingColors.expected)
  }

  await expect(page).toHaveScreenshot('design-system.png', {
    fullPage: true,
    stylePath: './visual-regression/screenshot.css',
  })
})
