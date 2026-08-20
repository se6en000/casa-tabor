import { expect, test } from '@playwright/test'

test.beforeEach(async ({ page }, testInfo) => {
  const { theme, density } = testInfo.project.metadata
  await page.addInitScript((selectedTheme) => {
    localStorage.clear()
    localStorage.setItem('casa-theme-auto-midnight', '0')
    localStorage.setItem('casa-theme-force-midnight', selectedTheme === 'midnight' ? '1' : '0')
    localStorage.setItem('casa-design-font-scale', '1')
  }, theme)
  await page.goto(`/__visual-regression?density=${density}`)
  await expect(page.getByTestId('visual-regression-fixture')).toBeVisible()
})

test('interactive controls expose accessible names', async ({ page }) => {
  const controls = page.locator('button, input:not([type="hidden"]), select, textarea')
  for (let index = 0; index < await controls.count(); index += 1) {
    const control = controls.nth(index)
    if (await control.isVisible()) await expect(control).toHaveAccessibleName(/\S/)
  }
})

test('touch targets and kiosk supporting text meet physical-use minimums', async ({ page }, testInfo) => {
  const { density } = testInfo.project.metadata
  test.skip(density === 'compact', 'Physical touch-size certification applies to touch and kiosk densities.')

  const minimumTarget = density === 'kiosk' ? 48 : 44
  const controls = page.locator('button:visible, label:has(input[type="checkbox"]):visible')
  for (let index = 0; index < await controls.count(); index += 1) {
    const box = await controls.nth(index).boundingBox()
    expect(box, `control ${index} must have measurable geometry`).not.toBeNull()
    expect(box.height, `control ${index} must be at least ${minimumTarget}px tall`).toBeGreaterThanOrEqual(minimumTarget)
  }

  if (density === 'kiosk') {
    const supportingText = page.locator('.text-caption:visible, .text-body-sm:visible')
    for (let index = 0; index < await supportingText.count(); index += 1) {
      const fontSize = await supportingText.nth(index).evaluate((element) => Number.parseFloat(getComputedStyle(element).fontSize))
      expect(fontSize).toBeGreaterThanOrEqual(18)
    }
  }
})

test('keyboard focus is visible and dialogs trap, dismiss, and restore focus', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'desktop-day-compact', 'One desktop profile certifies the shared keyboard contract.')

  const modalTrigger = page.getByRole('button', { name: 'Review dialog' })
  await modalTrigger.focus()
  const focusStyle = await modalTrigger.evaluate((element) => {
    const style = getComputedStyle(element)
    return { boxShadow: style.boxShadow, outline: style.outlineStyle }
  })
  expect(focusStyle.boxShadow !== 'none' || focusStyle.outline !== 'none').toBe(true)

  await modalTrigger.press('Enter')
  const modal = page.getByRole('dialog', { name: 'Review family plan' })
  await expect(modal).toBeVisible()
  await expect(modal.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Shift+Tab')
  await expect(modal.getByRole('button', { name: 'Confirm plan' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(modal).toBeHidden()
  await expect(modalTrigger).toBeFocused()

  const sheetTrigger = page.getByRole('button', { name: 'Open task sheet' })
  await sheetTrigger.focus()
  await sheetTrigger.press('Enter')
  const sheet = page.getByRole('dialog', { name: 'Today’s task details' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Close' })).toBeFocused()
  await page.keyboard.press('Escape')
  await expect(sheet).toBeHidden()
  await expect(sheetTrigger).toBeFocused()
})

test('reduced-motion preference suppresses long-running CSS motion', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' })
  const durations = await page.locator('body').evaluate(() => {
    const probe = document.createElement('div')
    probe.className = 'ai-thinking'
    document.body.append(probe)
    const style = getComputedStyle(probe)
    const result = { animationDuration: style.animationDuration, transitionDuration: style.transitionDuration }
    probe.remove()
    return result
  })
  expect(Number.parseFloat(durations.animationDuration)).toBeLessThanOrEqual(0.01)
  expect(Number.parseFloat(durations.transitionDuration)).toBeLessThanOrEqual(0.01)
})
