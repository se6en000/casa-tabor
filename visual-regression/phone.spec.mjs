import { expect, test } from '@playwright/test'
import { serveFontsFromCache } from './fontCache.mjs'

serveFontsFromCache(test)

// The phone (Phase 4, board section 05) at 390x844, drawn from the Wall's fixed fixture
// (tests/fixtures/wall-day-2026-09-25.mjs) at ?at=, as ?viewer=. Runs with the Wall guard.
test.use({ viewport: { width: 390, height: 844 }, hasTouch: true })

const open = async (page, at = '2026-09-25T07:12:00', viewer = 'jake-id') => {
  await page.goto(`/__phone-fixture?at=${at}&viewer=${viewer}`)
  const phone = page.getByTestId('phone-fixture')
  await expect(phone).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  return phone
}

test('phone: Me — the next move first (leave by), what others have covered, just yours', async ({ page }) => {
  const phone = await open(page)
  const next = phone.getByRole('region', { name: 'Your next move' })
  await expect(next.getByText('LEAVE BY 7:25')).toBeVisible()
  await expect(next.getByText('Palm Beach Public')).toBeVisible()
  await expect(next.getByText('Drop off Emme & Owen')).toBeVisible()
  const covered = phone.getByRole('region', { name: 'Covered' })
  await expect(covered.getByText('Kelly · Drop off Liv')).toBeVisible()
  await expect(phone.getByRole('region', { name: 'Just yours' }).getByText('Pick up Photobook for Liv')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-me.png')
})

test('phone: Leaving now puts the move on the road (with undo); Hand off offers who is free', async ({ page }) => {
  const phone = await open(page)
  const next = phone.getByRole('region', { name: 'Your next move' })
  await next.getByRole('button', { name: 'Leaving now' }).click()
  await expect(next.getByText('ON THE ROAD')).toBeVisible()
  await next.getByRole('button', { name: 'Not yet (undo)' }).click()
  await expect(next.getByText('LEAVE BY 7:25')).toBeVisible()
  await next.getByRole('button', { name: 'Hand off' }).click()
  const sheet = phone.getByRole('region', { name: 'Hand off' })
  await expect(sheet.getByRole('button', { name: /Kelly/ })).toBeVisible()
  await sheet.getByRole('button', { name: /Giselle/ }).click()
  await expect(phone.getByText('Nothing for you to drive today.')).toBeVisible() // it's Giselle's now
})

test('phone: hidden from the honoree — on Jake\'s phone, not on Kelly\'s', async ({ page }) => {
  let phone = await open(page, '2026-09-26T07:30:00', 'jake-id')
  const kept = phone.getByRole('region', { name: 'Kept from someone' })
  await expect(kept.getByText(/HIDDEN FROM KELLY/)).toBeVisible()
  await expect(kept.getByRole('button', { name: 'Birthday card' })).toBeVisible()
  phone = await open(page, '2026-09-26T07:30:00', 'kelly')
  await expect(phone.getByRole('region', { name: 'Kept from someone' })).toHaveCount(0)
  await expect(phone.getByText('Birthday card')).toHaveCount(0)
})

test('phone: Family lists everyone\'s day and filters by person; Week opens a day', async ({ page }) => {
  const phone = await open(page)
  await phone.getByRole('button', { name: 'Family' }).click()
  await expect(phone.getByText('Bak Middle School')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-family.png')
  await phone.getByRole('button', { name: 'Emme', exact: true }).click()
  await expect(phone.getByText('Bak Middle School')).toHaveCount(0)
  await expect(phone.getByText('Emme Practice Violin with Meredith')).toBeVisible()
  await phone.getByRole('button', { name: 'Week' }).click()
  await expect(phone).toHaveScreenshot('phone-week.png')
  await phone.getByRole('button', { name: /TOMORROW/ }).click()
  await expect(phone.getByText('Saturday, September 26')).toBeVisible()
})

test('phone: More opens the rest of Casa', async ({ page }) => {
  const phone = await open(page)
  await phone.getByRole('button', { name: 'More' }).click()
  await expect(phone.getByRole('link', { name: /Grocery/ })).toBeVisible()
  await expect(phone.getByRole('link', { name: /See the Wall/ })).toBeVisible()
})

test('phone: after 7 PM, Me and Family look at tomorrow (like the wall\'s evening)', async ({ page }) => {
  const phone = await open(page, '2026-09-25T20:15:00', 'jake-id')
  await expect(phone.getByRole('heading', { name: "Jake's tomorrow" })).toBeVisible()
  const next = phone.getByRole('region', { name: 'Your next move' })
  await expect(next.getByText('LEAVE BY 11:56')).toBeVisible()
  await expect(phone.getByRole('region', { name: 'Kept from someone' }).getByRole('button', { name: 'Birthday card' })).toBeVisible()
  await phone.getByRole('button', { name: 'Family' }).click()
  await expect(phone.getByText('Saturday, September 26')).toBeVisible()
})

test('phone: an event — details, the trip, get & pack; Edit a time and save; Delete after a yes', async ({ page }) => {
  const phone = await open(page, '2026-09-26T08:00:00', 'jake-id')
  await phone.getByRole('button', { name: 'Family' }).click()
  await phone.getByRole('button', { name: /Softball: Huskies/ }).click()
  const sheet = phone.getByRole('region', { name: /Softball: Huskies @ RPB Cascade on the phone/ })
  await expect(sheet.getByText('SAT · 12:30 – 2:30 PM')).toBeVisible()
  await expect(sheet.getByText('Jake drives')).toBeVisible()
  await expect(sheet.getByRole('link', { name: 'Directions' })).toBeVisible()
  await sheet.getByRole('button', { name: 'Water bottle' }).click()
  await expect(sheet.getByText('GET & PACK · 2 OF 2')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-event.png')

  await sheet.getByRole('button', { name: 'Edit' }).click()
  await expect(sheet.getByRole('button', { name: 'Done' })).toBeVisible() // nothing changed yet
  await sheet.getByRole('button', { name: 'Start later' }).click()
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(phone.getByRole('region', { name: /on the phone/ })).toHaveCount(0)
  await phone.getByRole('button', { name: /Softball: Huskies/ }).click()
  await expect(phone.getByText('SAT · 12:45 – 2:45 PM')).toBeVisible() // the end follows the start

  await phone.getByRole('button', { name: 'Delete' }).click()
  await expect(phone.getByText('Delete “Softball: Huskies @ RPB Cascade”?')).toBeVisible()
  await phone.getByRole('button', { name: 'Yes, delete' }).click()
  await expect(phone.getByRole('button', { name: /Softball: Huskies/ })).toHaveCount(0)
})

test('phone: Hand off from an event gives the trip to someone else', async ({ page }) => {
  const phone = await open(page, '2026-09-26T08:00:00', 'jake-id')
  await phone.getByRole('button', { name: 'Family' }).click()
  await phone.getByRole('button', { name: /Softball: Huskies/ }).click()
  await phone.getByRole('button', { name: 'Hand off' }).click()
  await phone.getByRole('region', { name: 'Hand off' }).getByRole('button', { name: /Kelly/ }).click()
  await expect(phone.getByText('Kelly drives', { exact: true })).toBeVisible()
})

test('phone: + → Type it adds an event on the day being looked at, with who is going', async ({ page }) => {
  const phone = await open(page, '2026-09-25T10:00:00', 'jake-id')
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Type it/ }).click()
  const sheet = phone.getByRole('region', { name: /on the phone/ })
  await expect(sheet.getByRole('button', { name: 'Add it' })).toBeDisabled()
  await sheet.getByRole('textbox').first().fill('Haircut')
  await sheet.getByPlaceholder(/Home, a place/).fill('Great Clips')
  await sheet.getByRole('button', { name: 'Owen', exact: true }).click()
  await expect(phone).toHaveScreenshot('phone-add.png')
  await sheet.getByRole('button', { name: 'Add it' }).click()
  await expect(phone.getByRole('region', { name: /on the phone/ })).toHaveCount(0)
  await phone.getByRole('button', { name: 'Family' }).click()
  await expect(phone.getByRole('button', { name: /Haircut/ })).toBeVisible()
})

test('phone: the next-move card — Directions first, the right words mid-trip, Edit opens straight into editing', async ({ page }) => {
  let phone = await open(page, '2026-09-25T07:38:00', 'jake-id')
  let card = phone.getByRole('region', { name: 'Your next move' })
  await expect(card.getByText('THERE NOW · BACK BY 7:45')).toBeVisible() // not "leave by 7:25" at 7:38
  await expect(card.getByRole('button', { name: 'Leaving now' })).toHaveCount(0)
  phone = await open(page, '2026-09-26T09:00:00', 'jake-id')
  card = phone.getByRole('region', { name: 'Your next move' })
  await expect(card.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', /destination=Ferrin%20Park%20Field%201/)
  await expect(phone).toHaveScreenshot('phone-card.png')
  await card.getByRole('button', { name: 'Edit' }).click()
  await expect(phone.getByRole('region', { name: /on the phone/ }).getByText('TITLE')).toBeVisible()
})

test('phone: People — find someone, then call, text or drive there', async ({ page }) => {
  const phone = await open(page)
  await phone.getByRole('button', { name: 'More' }).click()
  await phone.getByRole('button', { name: /People/ }).click()
  const people = phone.getByRole('region', { name: 'People' })
  await people.getByRole('searchbox', { name: 'Find a person' }).fill('coach')
  await expect(people.getByText('Coach Mike')).toBeVisible()
  await expect(people.getByText('Layla Brooks')).toHaveCount(0)
  await expect(people.getByRole('link', { name: /Call/ })).toHaveAttribute('href', 'tel:+15615550101')
  await expect(people.getByRole('link', { name: /Directions/ })).toHaveAttribute('href', /destination=11921%20Okeechobee/)
  await people.getByRole('searchbox', { name: 'Find a person' }).fill('')
  await expect(phone).toHaveScreenshot('phone-people.png')
})

test('phone: + → Scan it reads a flyer into ticked drafts; only what stays ticked is added', async ({ page }) => {
  const phone = await open(page, '2026-09-25T10:00:00', 'jake-id')
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Scan it/ }).click()
  const sheet = phone.getByRole('region', { name: 'Scan it' })
  await sheet.locator('input[type=file]').first().setInputFiles({ name: 'flyer.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })
  await expect(sheet.getByText('Sun, Sep 27 · 11:00 AM – 3:00 PM')).toBeVisible()
  await expect(sheet.getByText('Tue, Sep 29 · All day')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Add 2' })).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-scan.png')
  await sheet.getByRole('button', { name: 'Skip Picture Day' }).click()
  await sheet.getByRole('button', { name: 'Add 1' }).click()
  // It says what went in (Jake, 2026-09-28: "everything went away, so I can't tell").
  await expect(sheet.getByRole('list', { name: 'Added' }).getByText('Palm Beach Public PTO Fall Festival · Sun Sep 27 · 11:00 AM')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-scan-added.png')
  await sheet.getByRole('button', { name: 'Done' }).click()
  await expect(phone.getByRole('region', { name: 'Scan it' })).toHaveCount(0)
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: /^SUN/ }).click()
  await expect(phone.getByRole('button', { name: /PTO Fall Festival/ })).toBeVisible()
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: /^TUE/ }).click()
  await expect(phone.getByText('Picture Day')).toHaveCount(0)
})

test('phone: + → Say it asks the assistant; a change waits for a yes; the bug icon sends the conversation', async ({ page }) => {
  const phone = await open(page, '2026-09-25T10:00:00', 'jake-id')
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Say it/ }).click()
  const ask = phone.getByRole('region', { name: 'Ask Casa' })
  await ask.getByRole('button', { name: /Who’s driving Liv tomorrow/ }).click() // an example, to start
  await expect(ask.getByText(/Kelly drives Liv/)).toBeVisible()
  await ask.getByRole('textbox', { name: 'Ask Casa' }).fill('Add Jaida watching the kids Saturday 12 to 3')
  await ask.getByRole('button', { name: 'Send' }).click()
  await expect(ask.getByText('DRAFT · NOT SAVED YET')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-say.png')
  await ask.getByRole('button', { name: 'Yes, do it' }).click()
  await expect(ask.getByText('Done.')).toBeVisible()
  await ask.getByRole('button', { name: 'Report a problem' }).click()
  await ask.getByRole('button', { name: 'Wrong answer' }).click()
  await ask.getByRole('textbox', { name: 'WHAT DID YOU EXPECT?' }).fill('Jake drives')
  await ask.getByRole('button', { name: 'Send report' }).click()
  await expect(ask.getByText(/sent with the whole conversation/)).toBeVisible()
  const reports = await page.evaluate(() => window.__phoneReports)
  expect(reports).toHaveLength(1)
  expect(reports[0].categories).toEqual(['Wrong answer'])
  expect(reports[0].lines.map((l) => l.role)).toEqual(['user', 'assistant', 'user', 'assistant'])
  await ask.getByRole('button', { name: 'Back', exact: true }).first().click()
  await ask.getByRole('button', { name: 'Back' }).first().click()
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: /TOMORROW/ }).click()
  await expect(phone.getByRole('button', { name: /Jaida watching the kids/ })).toBeVisible()
})

test('phone: Keep from… — a celebration suggests it; kept, it is marked for everyone else', async ({ page }) => {
  const phone = await open(page, '2026-09-26T07:30:00', 'jake-id')
  await phone.getByRole('button', { name: 'Family' }).click()
  await phone.getByRole('button', { name: /Kelly's Birthday/ }).click()
  const sheet = phone.getByRole('region', { name: /Kelly's Birthday on the phone/ })
  await expect(sheet.getByText('Everyone can see it, and it’s on the wall.')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Keep from Jake' })).toHaveCount(0) // never from yourself
  await sheet.getByRole('button', { name: 'Keep it from Kelly' }).click()
  await expect(sheet.getByRole('button', { name: 'Keep from Kelly' })).toHaveAttribute('aria-pressed', 'true')
  await expect(sheet.getByText('Not on the wall, and never on Kelly’s phone.')).toBeVisible()
  await sheet.getByText('KEEP FROM').scrollIntoViewIfNeeded()
  await expect(phone).toHaveScreenshot('phone-keep-from.png')
  await sheet.getByRole('button', { name: 'Back' }).click()
  await expect(phone.getByText('KEPT FROM KELLY')).toBeVisible()
})

test("phone: Giselle's lens — the kids' things and what she drives, not Jake's and Kelly's own", async ({ page }) => {
  let phone = await open(page, '2026-09-25T10:00:00', 'giselle')
  await phone.getByRole('button', { name: 'Family' }).click()
  await expect(phone.getByText('Emme Practice Violin with Meredith')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-giselle-family.png')
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: /^THU/ }).click()
  await expect(phone.getByText('Book club at the Harrisons')).toHaveCount(0)
  phone = await open(page, '2026-09-25T10:00:00', 'jake-id')
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: /^THU/ }).click()
  await expect(phone.getByText('Book club at the Harrisons')).toBeVisible()
})

// Ask Casa with the assistant's cards (design section 06e/06f), from canned conversations (`?ask=`).
const askScene = async (page, scene) => {
  await page.goto(`/__phone-fixture?at=2026-09-25T13:40:00&viewer=jake-id&ask=${scene}`)
  const phone = page.getByTestId('phone-fixture')
  await expect(phone).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Say it/ }).click()
  return { phone, ask: phone.getByRole('region', { name: 'Ask Casa' }) }
}

test('phone: Ask Casa — the one draft, revised in place, says what just changed, where it lands and who can drive', async ({ page }) => {
  const { phone, ask } = await askScene(page, 'add')
  const card = ask.getByLabel('Draft')
  await expect(card).toHaveCount(1)
  await expect(card.getByText('Dentist · Liv')).toBeVisible()
  await expect(card.getByText('Just changed: 3:30 → 4:00')).toBeVisible()
  await expect(card.getByText('3:31')).toBeVisible()
  await expect(card.getByText('Kelly · free')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-ask-draft.png')
})

test('phone: Ask Casa — a change says before → after, and a driver can be picked on it', async ({ page }) => {
  const { phone, ask } = await askScene(page, 'change')
  const card = ask.getByLabel('Draft')
  await expect(card.getByText('12:30 – 2:30 PM')).toBeVisible()
  await expect(card.getByText('12:26')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-ask-change.png')
  await card.getByRole('button', { name: 'Kelly · free' }).click()
  await expect(card.getByRole('button', { name: 'Kelly · free' })).toHaveAttribute('aria-pressed', 'true')
})

test('phone: Ask Casa — "which one?" as tiles, the change kept; a tap answers with the name', async ({ page }) => {
  const { phone, ask } = await askScene(page, 'which')
  await expect(ask.getByText('Your change is kept: → 5:00 PM')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-ask-which.png')
  await ask.getByRole('button', { name: /Softball: Huskies/ }).click()
  await expect(ask.getByText('Softball: Huskies @ RPB Cascade', { exact: true }).last()).toBeVisible()
  await expect(ask.getByText('Your change is kept: → 5:00 PM')).toHaveCount(0)
})

test('phone: Ask Casa — an answer that offers something gets a one-tap yes', async ({ page }) => {
  const { ask } = await askScene(page, 'answer')
  await ask.getByRole('button', { name: 'Yes, do that' }).click()
  await expect(ask.getByText('Yes, do that', { exact: true })).toBeVisible()
})

test('phone: Week › Coming up — what needs planning, answers take an item off, gift ideas never on the phone of the person they are for (board 07b)', async ({ page }) => {
  const phone = await open(page)
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: 'Coming up' }).click()
  await expect(phone.getByRole('heading', { name: 'Coming up' })).toBeVisible()
  await expect(phone.getByText('4 to plan · 1 to start now')).toBeVisible()
  await expect(phone.getByText('Plan by Sep 21 · late · in 3 days')).toBeVisible()
  await expect(phone.getByText('Gift ideas: That ceramic class in Delray')).toBeVisible()
  await expect(page).toHaveScreenshot('phone-coming-up.png')
  await phone.getByRole('region', { name: 'START NOW' }).getByRole('button', { name: 'Done' }).click()
  await expect(phone.getByText('EDS Air Conditioning appointment')).toHaveCount(0)
  await expect(phone.getByText('3 to plan')).toBeVisible()
  await phone.getByRole('button', { name: 'This week' }).click()
  await expect(phone.getByRole('heading', { name: 'The week' })).toBeVisible()

  const kellys = await open(page, '2026-09-25T07:12:00', 'kelly')
  await kellys.getByRole('button', { name: 'Week' }).click()
  await kellys.getByRole('button', { name: 'Coming up' }).click()
  await expect(kellys.getByText('Kelly’s birthday')).toBeVisible()
  await expect(kellys.getByText(/ceramic class/)).toHaveCount(0)
})

test('phone: Ask Casa — a tip while Casa thinks; "What can I say?" lists them by topic (boards 07e/07f)', async ({ page }) => {
  const { phone, ask } = await askScene(page, 'thinking')
  await expect(ask.getByText('Thinking…')).toBeVisible()
  await expect(ask.getByText(/^Tip: /)).toBeVisible()
  await expect(ask.getByText(/gift idea/i).first()).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-thinking-tip.png')
  await ask.getByRole('button', { name: 'What can I say?' }).click()
  await expect(ask.getByRole('heading', { name: 'What can I say?' })).toBeVisible()
  for (const topic of ['Calendar', 'Coming up', 'Gift ideas', 'Groceries & recipes', 'Talking to Casa']) await expect(ask.getByRole('region', { name: topic })).toBeAttached()
  await expect(phone).toHaveScreenshot('phone-what-can-i-say.png')
  await ask.getByRole('button', { name: 'Back' }).click()
  await expect(ask.getByRole('heading', { name: 'Ask Casa' })).toBeVisible()
})

// Swipe between days on Me and Family (2026-09-28: "it feels natural there").
const phoneSwipe = (page, from, to) => page.evaluate(([from, to]) => {
  const el = document.elementFromPoint(from[0], from[1])
  const at = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [at(...from)], changedTouches: [at(...from)] }))
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [at(...to)] }))
}, [from, to])

test('phone: swiping Me and Family moves the day; a scroll does not; tapping Me comes back to today', async ({ page }) => {
  const phone = await open(page)
  await expect(phone.getByRole('heading', { name: "Jake's day" })).toBeVisible()
  await phoneSwipe(page, [320, 400], [120, 410])
  await expect(phone.getByRole('heading', { name: "Jake's tomorrow" })).toBeVisible()
  await phoneSwipe(page, [320, 400], [120, 400])
  await expect(phone.getByRole('heading', { name: "Jake's Sunday" })).toBeVisible()
  await phoneSwipe(page, [200, 600], [220, 200])
  await expect(phone.getByRole('heading', { name: "Jake's Sunday" })).toBeVisible()
  await phone.getByRole('button', { name: 'Me', exact: true }).click()
  await expect(phone.getByRole('heading', { name: "Jake's day" })).toBeVisible()

  await phone.getByRole('button', { name: 'Family' }).click()
  await expect(phone.getByText('Friday, September 25')).toBeVisible()
  await phoneSwipe(page, [320, 400], [120, 400])
  await expect(phone.getByText('Saturday, September 26')).toBeVisible()
  await phoneSwipe(page, [120, 400], [320, 400])
  await phoneSwipe(page, [120, 400], [320, 400])
  await expect(phone.getByText('Friday, September 25')).toBeVisible()
})

test('phone: Scan it — something already on the calendar that day starts unticked and says so', async ({ page }) => {
  const phone = await open(page, '2026-09-25T10:00:00&similar=1', 'jake-id')
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Scan it/ }).click()
  const sheet = phone.getByRole('region', { name: 'Scan it' })
  await sheet.locator('input[type=file]').first().setInputFiles({ name: 'flyer.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })
  await expect(sheet.getByText(/Already on your calendar: PTO Fall Festival · 11:00 AM/)).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Add Palm Beach Public PTO Fall Festival' })).toHaveAttribute('aria-pressed', 'false')
  await expect(sheet.getByRole('button', { name: 'Add 1' })).toBeVisible()
})
