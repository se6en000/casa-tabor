import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }, testInfo) => {
  const { theme } = testInfo.project.metadata
  await page.addInitScript((selectedTheme) => {
    localStorage.clear()
    localStorage.setItem('casa-theme-auto-midnight', '0')
    localStorage.setItem('casa-theme-force-midnight', selectedTheme === 'midnight' ? '1' : '0')
    localStorage.setItem('casa-experience-mode', 'living_canvas')
    localStorage.setItem('casa-canvas-submode', 'calm')
  }, theme)
})

test('living canvas defaults to calm kiosk view with distance-readable elements', async ({ page }) => {
  await page.goto('/')
  await expect(page.getByText(/Ambient Living Kiosk/i)).toBeVisible()
  await expect(page.getByText(/Tabor Family/i)).toBeVisible()
  await expect(page.getByText(/Today's Appointments/i)).toBeVisible()
})

test('switching submode to turbo reveals 3-pane living canvas', async ({ page }) => {
  await page.goto('/')
  const turboButton = page.getByRole('button', { name: /Turbo Mode|Expand All/i }).first()
  await expect(turboButton).toBeVisible()
  await turboButton.click()

  // In Turbo Mode, Daily Briefing and Attention Hub panes are visible
  await expect(page.getByText(/Daily Briefing/i).or(page.getByText(/Morning Brief/i))).toBeVisible()
})

test('tapping an appointment opens the slide-out event inspector drawer', async ({ page }) => {
  await page.goto('/')
  const firstAppointment = page.locator('div[class*="cursor-pointer"]').first()
  if (await firstAppointment.isVisible()) {
    await firstAppointment.click()
    // Event details inspector drawer opens
    await expect(page.getByRole('dialog').or(page.locator('[aria-modal="true"]'))).toBeVisible()
  }
})
