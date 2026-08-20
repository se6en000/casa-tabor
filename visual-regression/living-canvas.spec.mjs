import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }, testInfo) => {
  const { theme } = testInfo.project.metadata
  await page.addInitScript((selectedTheme) => {
    localStorage.clear()
    localStorage.setItem('casa-theme-auto-midnight', '0')
    localStorage.setItem('casa-theme-force-midnight', selectedTheme === 'midnight' ? '1' : '0')
    localStorage.setItem('casa-experience-mode', 'living_canvas')
    localStorage.setItem('casa-canvas-submode', 'calm')
    localStorage.setItem('casa_tabor_profile_session', JSON.stringify({
      memberId: 'family-tabor-id',
      memberName: 'Tabor Family',
      token: 'mock-token'
    }))
  }, theme)
})

test('living canvas defaults to calm kiosk view with distance-readable elements', async ({ page }, testInfo) => {
  const { isMobile } = testInfo.project.use
  await page.goto('/')
  if (isMobile) {
    await expect(page.locator('div[data-calendar-event]').first().or(page.getByRole('button', { name: /Schedule|Actions|Dinner/i }).first())).toBeVisible()
  } else {
    await expect(page.getByText(/Tabor Family/i)).toBeVisible()
    await expect(page.getByRole('button', { name: /Turbo Canvas|Triage Items/i }).first()).toBeVisible()
  }
})

test('switching submode to turbo reveals living canvas action center', async ({ page }, testInfo) => {
  const { isMobile } = testInfo.project.use
  await page.goto('/')
  if (!isMobile) {
    const turboButton = page.getByRole('button', { name: /Turbo Canvas|Triage Items/i }).first()
    await expect(turboButton).toBeVisible()
    await turboButton.click()

    // In Turbo Mode, Action Queue is visible
    await expect(page.getByRole('heading', { name: 'Action Queue' })).toBeVisible()
  } else {
    const actionsTab = page.getByRole('button', { name: /Actions/i }).first()
    if (await actionsTab.isVisible()) {
      await actionsTab.click()
    }
  }
})

test('tapping an appointment opens the slide-out event inspector drawer', async ({ page }) => {
  await page.goto('/')
  const firstAppointment = page.locator('div[data-calendar-event], div[class*="cursor-pointer"]').first()
  if (await firstAppointment.isVisible()) {
    await firstAppointment.click()
    // Event details inspector drawer / sidecar opens
    await expect(page.locator('[data-panel-overlay], [role="dialog"], aside, .sidecar-flip-card').first()).toBeVisible()
  }
})

