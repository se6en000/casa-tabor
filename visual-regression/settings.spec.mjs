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
  await expect(s.getByRole('button', { name: 'Reconnect' })).toHaveCount(1)
  // A sync that fails isn't a lost sign-in (the family calendar, Sept 30 – Oct 6): it says so, and no Reconnect.
  await expect(s.getByText(/family@example\.com · syncing fails since/)).toBeVisible()
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
  await expect(s.getByRole('region', { name: 'On the wall', exact: true })).toBeVisible()
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

// Jake, Oct 6 ("I dont see some of the functionality … where it is on the color spectrum currently, brightness graph,
// routines … identify the gaps and fill them"): what the canvas boards showed and the first build left out.
test('settings: the wall — the room’s light on the band right now, the screen, and the last 24 hours', async ({ page }) => {
  const s = await open(page, { page: 'wall' })
  const now = s.getByRole('region', { name: 'Right now' })
  await expect(now).toContainText('The room’s light is')
  await expect(now.getByRole('img', { name: /On the band from candle-warm to daylight/ })).toBeVisible()
  await expect(now).toContainText('% bright')
  await expect(s.getByRole('img', { name: /The screen's brightness over the last day/ })).toBeVisible()
})

test('settings: chores and routines — the school runs, opened in the wall’s routine editor; add one', async ({ page }) => {
  const s = await open(page, { page: 'chores' })
  const routines = s.getByRole('region', { name: 'Routines: school, work, camp' })
  await expect(routines).toContainText('Liv · School')
  await expect(routines).toContainText('Jake drops off')
  await routines.getByRole('button', { name: /Edit Liv’s/ }).click()
  await expect(page.getByRole('region', { name: /Liv’s .* — edit/ })).toBeVisible()
})

test('settings: family — add someone', async ({ page }) => {
  const s = await open(page, { page: 'family' })
  await s.getByRole('button', { name: 'Add someone, or a pet' }).click()
  const sheet = page.getByRole('region', { name: 'Add someone' })
  await sheet.getByRole('textbox', { name: 'Their name' }).fill('Grandma')
  await sheet.getByRole('tab', { name: 'Caregiver' }).click()
  await expect(sheet.getByRole('switch', { name: 'They drive' })).toHaveAttribute('aria-checked', 'true')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(s.getByRole('status')).toHaveText('Grandma is in the family.')
})

test('settings: places — a place found in email is kept or put away', async ({ page }) => {
  const s = await open(page, { page: 'places' })
  const found = s.getByRole('region', { name: 'Found in email and events · 1' })
  await expect(found).toContainText('Pet Supermarket on Dixie')
  await found.getByRole('button', { name: 'Keep Pet Supermarket on Dixie' }).click()
  await expect(s.getByRole('status')).toHaveText('Pet Supermarket on Dixie is saved.')
  await expect(s.getByRole('region', { name: /Found in email/ })).toHaveCount(0)
})

test('settings: calendars — choose a person’s calendars, and whose email the reader reads', async ({ page }) => {
  const s = await open(page, { page: 'calendars' })
  await expect(s.getByRole('switch', { name: 'Read Jake’s email' })).toHaveAttribute('aria-checked', 'true')
  await s.getByRole('button', { name: 'Choose Jake’s calendars' }).click()
  const sheet = page.getByRole('region', { name: 'Jake’s calendars' })
  await expect(sheet).toContainText('Where new events go')
  await sheet.getByRole('switch', { name: 'Show US Holidays' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(s.getByRole('status')).toHaveText('Calendars saved.')
})

test('settings: voice — the last things it heard', async ({ page }) => {
  const s = await open(page, { page: 'voice' })
  await expect(s.getByRole('region', { name: 'The last things it heard' })).toContainText('What do we have going on today?')
})

// Jake, Oct 6: "compare what is on the wall with the proposed design … the wall/pi settings will have more settings
// options than the mobile version". The wall's own sensor, light strip, listener and screen; Advanced by Jake's PIN.
const WALL = { width: 1920, height: 1080 }
test('settings on the wall: Advanced asks for Jake’s PIN each visit, whoever the kiosk is signed in as', async ({ page }) => {
  const s = await open(page, { wall: '1' }, WALL)
  await s.getByRole('tab', { name: 'Advanced' }).click()
  const gate = s.getByRole('region', { name: 'Advanced is Jake’s' })
  for (const k of '111111') await gate.getByRole('button', { name: k, exact: true }).click()
  await expect(gate).toContainText('That PIN isn’t right.')
  for (const k of '123456') await gate.getByRole('button', { name: k, exact: true }).click()
  await expect(s.getByRole('button', { name: 'Open Usage and cost' })).toBeVisible()
  await expect(page).toHaveScreenshot('settings-wall-advanced-open.png')
})

test('settings on the wall: the light sensor’s sleep and wake levels and the light strip, wall only', async ({ page }) => {
  let s = await open(page, { wall: '1', page: 'wall' }, WALL)
  const sensor = s.getByRole('region', { name: 'The light sensor, on this wall' })
  await sensor.getByRole('button', { name: 'More: Sleep when darker than' }).click()
  await expect(sensor.getByRole('group', { name: 'Sleep when darker than' })).toContainText('1.3 lux')
  await expect(sensor.getByRole('group', { name: 'Wake when brighter than' })).toContainText('1.4 lux')
  await sensor.getByRole('button', { name: 'Try it' }).click()
  await expect(s.getByRole('status')).toHaveText('There it goes.')
  s = await open(page, { page: 'wall' })
  await expect(s.getByRole('region', { name: 'The light sensor, on this wall' })).toHaveCount(0)
})

test('settings: holding the screen at one brightness, and back to following the room', async ({ page }) => {
  const s = await open(page, { page: 'wall' })
  await s.getByRole('switch', { name: 'Follow the room’s light' }).click()
  await expect(s.getByRole('group', { name: 'Hold the brightness at' })).toContainText('50 %')
  await expect(s.getByRole('group', { name: 'Dimmest brightness' })).toHaveCount(0)
  await s.getByRole('switch', { name: 'Follow the room’s light' }).click()
  await expect(s.getByRole('group', { name: 'Dimmest brightness' })).toContainText('0 %')
})

test('settings on the wall: this wall’s health, its listener, and maintenance that runs here', async ({ page }) => {
  const unlock = async (s) => {
    for (const k of '123456') await s.getByRole('region', { name: 'Advanced is Jake’s' }).getByRole('button', { name: k, exact: true }).click()
  }
  let s = await open(page, { wall: '1', page: 'limits' }, WALL)
  await unlock(s)
  const wall = s.getByRole('region', { name: 'This wall' })
  await expect(wall).toContainText('Working')
  await expect(wall).toContainText('0–100 on the monitor’s own scale')
  s = await open(page, { wall: '1', page: 'voice' }, WALL)
  await unlock(s)
  await expect(s.getByText('Running, waiting for the wake word')).toBeVisible()
  await expect(s.getByRole('group', { name: 'How easily it wakes' })).toContainText('12')
  s = await open(page, { wall: '1', page: 'maintenance' }, WALL)
  await unlock(s)
  await expect(s.getByRole('button', { name: 'Run: Reload this screen' })).toBeVisible()
  await s.getByRole('button', { name: 'Run: Re-measure the screen’s brightness range' }).click()
  await expect(s.getByText('The screen flickers for a few seconds. Tap again to go ahead')).toBeVisible()
})

// Jake, Oct 6: "family profile editing, where I can change the name, nicknames, add a pet, change the profile avatar
// color, and additional preferences that could be useful to customize the wall and how it presents the family".
test('settings: a family profile — name, nickname, color (a swap), place in the order, on the wall', async ({ page }) => {
  const s = await open(page, { page: 'family' })
  await s.getByRole('button', { name: 'Open Liv' }).click()
  await expect(page).toHaveScreenshot('settings-profile.png', { fullPage: true })
  const name = s.getByRole('textbox', { name: 'Name on the wall' })
  await name.fill('Livvy')
  await name.press('Enter')
  await expect(s.getByRole('heading', { name: 'Livvy', level: 1 })).toBeVisible()
  const nick = s.getByRole('textbox', { name: 'Add a nickname' })
  await nick.fill('Bug')
  await nick.press('Enter')
  await expect(s.getByRole('button', { name: 'Remove the nickname Bug' })).toBeVisible()
  // Jake's color: the two swap.
  await s.getByRole('radio', { name: /Color 1, Jake’s now/ }).click()
  await expect(s.getByRole('status')).toHaveText('Swapped colors with Jake.')
  await expect(s.getByRole('radio', { name: 'Color 1' })).toHaveAttribute('aria-checked', 'true')
  await expect(s.getByRole('radio', { name: /Color 3, Jake’s now/ })).toBeVisible()
  // Up one: 2nd of 6.
  await s.getByRole('button', { name: 'Move Livvy up' }).click()
  await expect(s.getByText(/^2nd of 6/)).toBeVisible()
  // Off the wall: she moves to "Not on the wall".
  await s.getByRole('switch', { name: 'Livvy on the wall' }).click()
  await s.getByRole('button', { name: 'Family', exact: true }).click()
  await expect(s.getByRole('region', { name: 'Not on the wall' })).toContainText('Livvy')
})

test('settings: pets — Milo is one; adding a pet starts it off the wall', async ({ page }) => {
  const s = await open(page, { page: 'family' })
  await expect(s.getByRole('region', { name: 'Not on the wall' })).toContainText('Pet')
  await s.getByRole('button', { name: 'Open Milo' }).click()
  await expect(s.getByRole('tab', { name: 'Pet' })).toHaveAttribute('aria-selected', 'true')
  await expect(s.getByRole('switch', { name: 'Milo drives' })).toHaveCount(0)
  await expect(s.getByRole('region', { name: 'Signing in' })).toHaveCount(0)
  await s.getByRole('button', { name: 'Family', exact: true }).click()
  await s.getByRole('button', { name: 'Add someone, or a pet' }).click()
  const sheet = page.getByRole('region', { name: 'Add someone' })
  await sheet.getByRole('tab', { name: 'Pet' }).click()
  await expect(sheet).toContainText('Pets start off the wall')
  await sheet.getByRole('textbox', { name: 'Their name' }).fill('Biscuit')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(s.getByRole('region', { name: 'Not on the wall' })).toContainText('Biscuit')
})
