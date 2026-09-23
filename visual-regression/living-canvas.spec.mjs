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
    // `.first()` on EACH side before `.or()` doesn't narrow the union to one
    // element -- Playwright's strict mode still sees every match from both
    // sides and throws "resolved to 2 elements" the moment more than one
    // real calendar event renders (confirmed live: two real events, correct
    // markup, nothing wrong with the app). `.first()` belongs on the
    // combined locator instead.
    await expect(page.locator('div[data-calendar-event]').or(page.getByRole('button', { name: /Schedule|Actions|Dinner/i })).first()).toBeVisible()
  } else {
    // Was `getByText(/Tabor Family/i)` -- that asserted the mocked profile
    // session's memberName rendered verbatim, which stopped being true once
    // the header settled on fixed "Maison Tabor" brand copy instead of a
    // per-session greeting (2026-09-23 investigation: confirmed live via the
    // actual banner accessibility tree, not a guess). The banner's brand
    // link is the real stable signal that the shell rendered for a logged-in
    // session -- assert on that instead of copy that's free to keep changing.
    await expect(page.getByRole('banner')).toBeVisible()
    await expect(page.getByText(/Maison Tabor/i).first()).toBeVisible()
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

    // In Turbo Mode, the action-center pane is visible. Was asserting the
    // heading "Action Queue" -- confirmed live (2026-09-23) that ActionQueueWidget's
    // own <h2> now reads "Household Tasks", per the in-progress naming-register
    // pass (see casa_tabor_homepage_redesign_initiative memory); the toggle
    // itself still works correctly, only the copy changed.
    await expect(page.getByRole('heading', { name: 'Household Tasks' })).toBeVisible()
  } else {
    const actionsTab = page.getByRole('button', { name: /Actions/i }).first()
    if (await actionsTab.isVisible()) {
      await actionsTab.click()
    }
  }
})

test('tapping an appointment opens the slide-out event inspector drawer', async ({ page }) => {
  await page.goto('/')
  // `:visible` matters here (2026-09-23 investigation): LivingCanvasHome always
  // mounts BOTH MobileTodayView (hidden via `lg:hidden`) and the desktop
  // CalmKioskView in the DOM at once, switching which one is shown with CSS,
  // not unmounting. MobileTodayView's own overdue-todo row comes first in
  // document order and matches this same broad selector, so an unscoped
  // `.first()` could silently grab that off-screen duplicate instead of the
  // real, visible card -- clicking it does nothing a user could ever see.
  const firstAppointment = page.locator('div[data-calendar-event]:visible, div[class*="cursor-pointer"]:visible').first()
  // A retrying wait, not a one-shot `isVisible()` check (2026-09-23): right
  // after page load, before the events query resolves, this correctly has
  // zero matches for a beat (CalmKioskView shows a loading skeleton -- see
  // tests/calm-kiosk-false-empty-flash.test.mjs for the bug that used to
  // make it show a confident, and false, empty-day state here instead). A
  // one-shot `isVisible()` check right after `goto` couldn't tell "not
  // ready yet" from "genuinely nothing to tap", and silently skipped this
  // whole test's real assertion on the exact runs where it mattered most --
  // this was masking a real dead-click bug (see
  // casa_tabor_playwright_living_canvas_fixes memory), not just being lenient
  // about an empty calendar. `waitFor` still lets a genuinely event-free day
  // skip gracefully; it just gives real data an honest chance to arrive first.
  const appeared = await firstAppointment
    .waitFor({ state: 'visible', timeout: 5000 })
    .then(() => true)
    .catch(() => false)
  if (appeared) {
    await firstAppointment.click()
    // Event details inspector drawer / sidecar opens
    await expect(page.locator('[data-panel-overlay], [role="dialog"], aside, .sidecar-flip-card').first()).toBeVisible()
  }
})

