import { test, expect } from '@playwright/test'

// Settings V2 (canvas 47; Jake, Oct 5: "go, A on the settings landing page … feel free to use your screen checks …
// mine as well be thorough"). Fixed data (/__settings-fixture): every page on the phone, the wall's and a laptop's
// layout, Advanced closed to anyone but Jake, search, and the controls doing what they say.

const PAGES = ['family', 'places', 'calendars', 'wall', 'knows', 'chores', 'usage', 'limits', 'checks', 'voice', 'maintenance']
const open = async (page, q = {}, viewport = { width: 390, height: 844 }) => {
  await page.setViewportSize(viewport)
  await page.goto(`/__settings-fixture?${new URLSearchParams(q)}`)
  const root = page.getByTestId('settings-fixture')
  await expect(root).toBeAttached()
  await expect(page.getByRole('heading', { level: 1 }).first()).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  return root
}

test('settings: the home is the glance (47a A) — each page with its state; Advanced is Jake’s five', { tag: '@smoke' }, async ({ page }) => {
  const s = await open(page)
  await expect(s.getByRole('heading', { name: 'Settings' })).toBeVisible()
  await expect(s.getByRole('button', { name: 'Open Family' })).toContainText('6 people · Face ID on for Jake')
  await expect(s.getByRole('button', { name: 'Open Calendars and email' })).toContainText('A calendar needs signing in again')
  await expect(s.getByRole('button', { name: 'Open What the assistant knows' })).toContainText('3 not sure yet')
  await expect(page).toHaveScreenshot('settings-home.png', { fullPage: true })
  await s.getByRole('tab', { name: 'Advanced' }).click()
  for (const name of ['Usage and cost', 'Limits and health', 'Checks', 'Voice', 'Maintenance']) await expect(s.getByRole('button', { name: `Open ${name}` })).toBeVisible()
  await expect(s.getByRole('button', { name: 'Open Usage and cost' })).toContainText('Today 41¢ · the family 6¢')
  await expect(page).toHaveScreenshot('settings-home-advanced.png', { fullPage: true })
})

test('settings: Advanced is closed to everyone but Jake — the home and a link straight to a page', async ({ page }) => {
  let s = await open(page, { viewer: 'kelly' })
  await s.getByRole('tab', { name: 'Advanced' }).click()
  await expect(s.getByRole('region', { name: 'Advanced is Jake’s' })).toBeVisible()
  await expect(s.getByRole('button', { name: 'Open Usage and cost' })).toHaveCount(0)
  s = await open(page, { viewer: 'kelly', page: 'usage' })
  await expect(s.getByRole('region', { name: 'Advanced is Jake’s' })).toBeVisible()
  await expect(s.getByText('41¢')).toHaveCount(0)
  // Search doesn't find them either.
  s = await open(page, { viewer: 'kelly' })
  await s.getByRole('textbox', { name: 'Search settings' }).fill('breaker')
  await expect(s.getByText('Nothing matches')).toBeVisible()
})

test('settings: search finds a page by the words people use, and opens it', async ({ page }) => {
  const s = await open(page)
  await s.getByRole('textbox', { name: 'Search settings' }).fill('brightness')
  await s.getByRole('button', { name: 'Open The wall' }).click()
  await expect(s.getByRole('heading', { name: 'The wall' })).toBeVisible()
  await s.getByRole('button', { name: 'Settings' }).click()
  await s.getByRole('textbox', { name: 'Search settings' }).fill('face id')
  await expect(s.getByRole('button', { name: 'Open Family' })).toBeVisible()
})

for (const id of PAGES) {
  test(`settings: ${id} on the phone`, async ({ page }) => {
    await open(page, { page: id })
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible()
    await page.waitForTimeout(150)
    await expect(page).toHaveScreenshot(`settings-${id}.png`, { fullPage: true })
  })
}

test('settings: the wall page — brightness steps, sleep and night glow switch, and saying so', async ({ page }) => {
  const s = await open(page, { page: 'wall' })
  await s.getByRole('button', { name: 'More: Brightest brightness' }).click()
  await expect(s.getByRole('group', { name: 'Brightest brightness' })).toContainText('55 %')
  await expect(s.getByRole('status')).toHaveText('Saved')
  await s.getByRole('switch', { name: 'Sleep when the room is dark' }).click()
  await expect(s.getByRole('group', { name: 'Sleep after the room goes dark' })).toHaveCount(0)
  await s.getByRole('switch', { name: 'Night glow' }).click()
  await expect(s.getByRole('switch', { name: 'Night glow' })).toHaveAttribute('aria-checked', 'false')
  // The screen's own idle switch is only on the wall itself.
  await expect(s.getByRole('switch', { name: 'Turn the screen off when idle' })).toHaveCount(0)
})

test('settings: what the assistant knows — yes moves it to sure, forget takes it away, filter by person', async ({ page }) => {
  const s = await open(page, { page: 'knows' })
  await expect(s.getByRole('region', { name: 'Not sure yet · 3' })).toBeVisible()
  await s.getByRole('button', { name: 'Yes, keep: Liv’s debate is on Thursdays' }).click()
  await expect(s.getByRole('region', { name: 'Not sure yet · 2' })).toBeVisible()
  await expect(s.getByRole('region', { name: 'Sure · 4' })).toContainText('Liv’s debate is on Thursdays')
  await s.getByRole('button', { name: 'Forget: Kelly goes to the gym at 7:30 most evenings' }).click()
  await expect(s.getByText('Kelly goes to the gym')).toHaveCount(0)
  await s.getByRole('button', { name: 'Owen', exact: true }).click()
  await expect(s.getByText('Owen sees his therapist at Hope Center ABA')).toBeVisible()
  await expect(s.getByText('The kids’ dentist is Dr. Ledakis')).toHaveCount(0)
  await s.getByRole('switch', { name: 'Keep private things off the wall' }).click()
  await expect(s.getByRole('switch', { name: 'Keep private things off the wall' })).toHaveAttribute('aria-checked', 'true')
})

test('settings: limits — pause and resume the AI, and the caps', async ({ page }) => {
  const s = await open(page, { page: 'limits' })
  await s.getByRole('button', { name: 'Pause' }).click()
  await expect(s.getByText('Paused', { exact: true })).toBeVisible()
  await s.getByRole('button', { name: 'Resume' }).click()
  await expect(s.getByText('Running', { exact: true })).toBeVisible()
  await s.getByRole('button', { name: 'Change' }).click()
  await s.getByRole('button', { name: 'More: Hourly cap' }).click()
  await expect(s.getByRole('group', { name: 'Hourly cap' })).toContainText('$4')
  await s.getByRole('button', { name: 'Save caps' }).click()
  await expect(s.getByRole('status')).toHaveText('Caps: $4 an hour, $10 a day.')
})

test('settings: calendars and email — the wall switch for email, and a broken calendar says so', async ({ page }) => {
  const s = await open(page, { page: 'calendars' })
  await expect(s.getByText('Needs signing in again')).toBeVisible()
  await expect(s.getByRole('button', { name: 'Reconnect' })).toBeVisible()
  await s.getByRole('switch', { name: 'Email text on the wall' }).click()
  await expect(s.getByText('Off · the wall shows only who it’s from')).toBeVisible()
})

test('settings: maintenance asks before it runs anything', async ({ page }) => {
  const s = await open(page, { page: 'maintenance' })
  await s.getByRole('button', { name: 'Run: Refresh the wall' }).click()
  await expect(s.getByText('Tap Run again to go ahead')).toBeVisible()
  await s.getByRole('button', { name: 'Run: Refresh the wall' }).click()
  await expect(s.getByRole('status')).toHaveText('The wall will reload in a minute.')
})

test('settings: family — a person’s page, and who drives', async ({ page }) => {
  const s = await open(page, { page: 'family' })
  await s.getByRole('button', { name: 'Open Giselle' }).click()
  await expect(s.getByRole('heading', { name: 'Giselle' })).toBeVisible()
  await s.getByRole('switch', { name: 'Giselle drives' }).click()
  await expect(s.getByRole('status')).toHaveText('Giselle won’t be offered as a driver.')
  await s.getByRole('button', { name: 'Family', exact: true }).click()
  await expect(s.getByRole('region', { name: 'People' })).toBeVisible()
})

test('settings: an old settings link lands on its new page', async ({ page }) => {
  const s = await open(page, { page: 'google' })
  await expect(s.getByRole('heading', { name: 'Calendars and email' })).toBeVisible()
})

test('settings: on the kitchen wall — the list beside the page, finger-sized (47f)', { tag: '@smoke' }, async ({ page }) => {
  const s = await open(page, { wall: '1', page: 'wall' }, { width: 1920, height: 1080 })
  await expect(s.getByRole('navigation', { name: 'Settings' })).toBeVisible()
  await expect(s.getByRole('button', { name: 'Back to the wall' })).toBeVisible()
  await expect(s.getByRole('switch', { name: 'Turn the screen off when idle' })).toBeVisible()
  await expect(page).toHaveScreenshot('settings-wall-the-wall.png')
  const row = await s.getByRole('button', { name: 'Open Places and people' }).boundingBox()
  expect(row.height).toBeGreaterThanOrEqual(80)
})

test('settings: Usage on the kitchen wall', async ({ page }) => {
  await open(page, { wall: '1', page: 'usage' }, { width: 1920, height: 1080 })
  await expect(page).toHaveScreenshot('settings-wall-usage.png')
})

test('settings: on a laptop — two columns, Family first', async ({ page }) => {
  const s = await open(page, {}, { width: 1280, height: 800 })
  await expect(s.getByRole('heading', { name: 'Family', level: 1 })).toBeVisible()
  await expect(page).toHaveScreenshot('settings-laptop.png')
})
