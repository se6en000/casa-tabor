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

test('phone: Me — the next move first (leave by), what others have covered, your day', async ({ page }) => {
  const phone = await open(page)
  const next = phone.getByRole('region', { name: 'Your next move' })
  await expect(next.getByText('LEAVE BY 7:25')).toBeVisible()
  await expect(next.getByText('Palm Beach Public')).toBeVisible()
  await expect(next.getByText('Drop off Emme & Owen')).toBeVisible()
  const covered = phone.getByRole('region', { name: 'Covered' })
  await expect(covered.getByText('Kelly · Drop off Liv')).toBeVisible()
  // Your day (Jake, Oct 2: "Anything I'm tagged in … should show up"): everything Jake is in today, his reminders too.
  await expect(phone.getByRole('region', { name: 'Your day' }).getByText('Pick up Photobook for Liv')).toBeVisible()
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
  // Groceries is the phone's own list now (canvas 33d); Meals and the rest are still the web pages.
  await expect(phone.getByRole('button', { name: /Groceries/ })).toBeVisible()
  await expect(phone.getByRole('link', { name: /Meals/ })).toBeVisible()
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
  // Jake, 2026-09-29: add to any event's or reminder's get & pack by hand.
  await sheet.getByRole('textbox', { name: 'Add to get & pack' }).fill('bug spray')
  await sheet.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(sheet.getByRole('button', { name: 'Bug spray' })).toBeVisible()
  await expect(sheet.getByText('GET & PACK · 2 OF 3')).toBeVisible()
  await expect(sheet.getByRole('textbox', { name: 'Add to get & pack' })).toHaveValue('')

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
  // A weekday at 4:00: both parents are at work (their Work routines, canvas 16), and the card says so.
  await expect(card.getByText('Kelly · busy')).toBeVisible()
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

// P3.25 phase 1: on a longer think, what Casa is looking up replaces "Thinking…" and the tip.
test('phone: Ask Casa — while Casa looks something up, it says what', async ({ page }) => {
  const { phone, ask } = await askScene(page, 'looking-up')
  await expect(ask.getByText('Searching the web: outdoor Halloween decorations Florida Reddit')).toBeVisible()
  await expect(ask.getByText(/^Tip: /)).toHaveCount(0)
  await expect(phone).toHaveScreenshot('phone-looking-up.png')
})

// Plan it with Casa on the phone (P3.25 phase 3; board 12e): the same draft, one sheet with ticks, Agree, Undo.
test('phone: Ask Casa — a plan: the draft in the conversation, Set it up, untick, Agree, Undo', async ({ page }) => {
  const { phone, ask } = await askScene(page, 'plan')
  const card = ask.getByRole('region', { name: 'Emme — light-up jellyfish — the plan' })
  await expect(card.getByText(/Just changed/)).toHaveCount(0)
  await expect(card.getByText('+ 4 shopping · 3 on the calendar · 1 pack')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-plan.png')
  await card.getByRole('button', { name: 'Set it up…' }).click()
  const agree = phone.getByRole('region', { name: 'Set up Emme — light-up jellyfish' })
  await agree.getByRole('button', { name: /^Bubble wrap/ }).click()
  await agree.getByRole('button', { name: 'Agree · set up 7' }).click()
  const saved = phone.getByRole('region', { name: 'Emme — light-up jellyfish — saved' })
  await expect(saved.getByText('SAVED · 7 THINGS')).toBeVisible()
  await expect(saved.getByText('Left out: Bubble wrap.')).toBeVisible()
  await saved.getByRole('button', { name: 'Undo this plan' }).click()
  await expect(saved.getByText('Emme — light-up jellyfish is undone')).toBeVisible()
})

// Jake, 2026-09-29: "on gift ideas, allow me to edit them, some brands don't get translated well."
test('phone: gift ideas can be corrected by typing; Kelly’s phone never shows hers', async ({ page }) => {
  const phone = await open(page, '2026-09-25T07:12:00', 'jake-id')
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: 'Coming up' }).click()
  await phone.getByRole('button', { name: 'Gift ideas · 2' }).click()
  const sheet = phone.getByRole('region', { name: 'Gift ideas' })
  await sheet.getByRole('textbox', { name: 'Gift idea for Carl' }).fill('An Orvis fly-fishing reel')
  await sheet.getByRole('button', { name: 'Save' }).click()
  await expect(sheet.getByRole('textbox', { name: 'Gift idea for Carl' })).toHaveValue('An Orvis fly-fishing reel')
  await expect(sheet.getByRole('button', { name: 'Save' })).toHaveCount(0)
  await expect(phone).toHaveScreenshot('phone-gift-ideas.png')

  const kellys = await open(page, '2026-09-25T07:12:00', 'kelly')
  await kellys.getByRole('button', { name: 'Week' }).click()
  await kellys.getByRole('button', { name: 'Coming up' }).click()
  await kellys.getByRole('button', { name: 'Gift ideas · 1' }).click()
  await expect(kellys.getByText('That ceramic class in Delray')).toHaveCount(0)
})

// Swipe between days on Me and Family (2026-09-28: "it feels natural there").
const phoneSwipe = (page, from, to) => page.evaluate(([from, to]) => {
  const el = document.elementFromPoint(from[0], from[1])
  const at = (x, y) => new Touch({ identifier: 1, target: el, clientX: x, clientY: y })
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, cancelable: true, touches: [at(...from)], changedTouches: [at(...from)] }))
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, cancelable: true, touches: [], changedTouches: [at(...to)] }))
}, [from, to])

// Any day on the phone (Jake, 2026-09-30): an answer about Oct 17 opens that day on Family (everyone's
// day, as asked), with the week around it to swipe; tapping Family or Me comes back to today.
test('phone: Casa opens a far day on Family; its week swipes; a tab comes back to today', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-09-25T13:40:00&viewer=jake-id&ask=open-day&far=1')
  const phone = page.getByTestId('phone-fixture')
  await page.evaluate(() => document.fonts.ready)
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Say it/ }).click()
  const ask = phone.getByRole('region', { name: 'Ask Casa' })
  await ask.getByRole('button', { name: 'Open Saturday, Oct 17' }).click()
  await expect(ask).toBeHidden()
  await expect(phone.getByText('Saturday, October 17')).toBeVisible()
  await expect(phone.getByText('Emme’s build night').first()).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-far-day.png')
  await phoneSwipe(page, [320, 400], [120, 410])
  await expect(phone.getByText('Sunday, October 18')).toBeVisible()
  await expect(phone.getByText('Green Market').first()).toBeVisible()
  await phone.getByRole('button', { name: 'Family' }).click()
  await expect(phone.getByText('Friday, September 25')).toBeVisible()
})

// Directions on the phone (canvas 13d, approved 2026-09-30).
test('phone: "Navigate to Alice\'s house" — Directions opens Google Maps; Call and Text', async ({ page }) => {
  const { phone, ask } = await askScene(page, 'directions')
  const card = ask.getByRole('region', { name: 'Directions to Alice' })
  await expect(card.getByText('8255 West Lake Drive, Lake Clark Shores, FL 33406')).toBeVisible()
  await expect(card.getByRole('link', { name: 'Directions — opens Google Maps' })).toHaveAttribute('href', /google\.com\/maps\/dir/)
  await expect(card.getByRole('link', { name: 'Call' })).toHaveAttribute('href', 'tel:+15615550101')
  await expect(card.getByRole('link', { name: 'Text' })).toHaveAttribute('href', 'sms:+15615550101')
  await expect(phone).toHaveScreenshot('phone-directions.png')
})

// Casa reads the email, phase 2, on the phone (canvas 14c, approved 2026-09-30).
test('phone: "Anything from email?" — the review in Ask Casa, one at a time, then a few it skipped', async ({ page }) => {
  const { phone, ask } = await askScene(page, 'email')
  const review = ask.getByRole('region', { name: 'From email' })
  await expect(review.getByText('FROM EMAIL · 1 OF 3')).toBeVisible()
  await expect(review.getByText('Owen’s class needs permission slips signed.')).toBeVisible()
  await expect(review.getByRole('link', { name: 'Open email' })).toHaveAttribute('href', 'https://mail.google.com/mail/#all/em-slip')
  await expect(phone).toHaveScreenshot('phone-email-review.png')
  await review.getByRole('button', { name: 'Add it' }).click()
  await review.getByRole('button', { name: 'Not needed' }).click()
  await review.getByRole('button', { name: 'Later' }).click()
  await expect(review.getByText('A FEW I SKIPPED · TELL ME IF ONE MATTERED')).toBeVisible()
  await review.getByRole('button', { name: 'It mattered' }).first().click()
  await review.getByRole('button', { name: 'Just this one' }).click()
  await review.getByRole('button', { name: 'All fine' }).click()
  await expect(ask.getByText('That’s everything from email.')).toBeVisible()
  expect(await page.evaluate(() => window.__emailAnswers)).toEqual(['em-slip:add', 'em-fee:not_needed', 'em-aba:later', 'sk-vet:mattered', 'sk-att:fine', 'sk-5k:fine'])
})

// Keep me posted on the phone (canvas row 15): the lines in Ask Casa, and Settings › Email under More.
test('phone: "Keep me posted" lines in Ask Casa — Add it on the dated one, Got it', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-09-25T13:40:00&viewer=jake-id&ask=email&email=posted')
  const phone = page.getByTestId('phone-fixture')
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Say it/ }).click()
  const review = phone.getByRole('region', { name: 'Ask Casa' }).getByRole('region', { name: 'From email' })
  await expect(review.getByText('KEEP ME POSTED · SALLY ROZANSKI · 3 THIS WEEK')).toBeVisible()
  await review.getByRole('button', { name: 'Add it' }).click()
  await review.getByRole('button', { name: 'Got it' }).click()
  expect(await page.evaluate(() => window.__emailAnswers)).toEqual(['ps-show:add', 'ps-thriller:seen'])
})

test('phone: Settings › Email — keep me posted, what’s quiet with Bring back, the wall switch', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-09-25T13:40:00&viewer=jake-id')
  const phone = page.getByTestId('phone-fixture')
  await page.evaluate(() => document.fonts.ready)
  await phone.getByRole('button', { name: 'More' }).click()
  await phone.getByRole('button', { name: /Email Keep me posted/ }).click()
  const settings = phone.getByRole('region', { name: 'Email settings' })
  await expect(settings.getByText('Sally Rozanski')).toBeVisible()
  await expect(settings.getByText('Rosangela Paine · to-dos')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-email-settings.png')
  await settings.getByRole('textbox', { name: 'Keep me posted on' }).fill('emails from Liv’s coach')
  await settings.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(settings.getByText('I’ll keep you posted on emails from Liv’s coach.')).toBeVisible()
  await settings.getByRole('button', { name: 'Bring back' }).click()
  await settings.getByRole('button', { name: 'Email text on the wall' }).click()
  await settings.getByRole('button', { name: 'Stop keeping me posted on Sally Rozanski' }).click()
  expect(await page.evaluate(() => window.__emailSettings)).toEqual([
    { action: 'add_rule', text: 'emails from Liv’s coach' },
    { action: 'bring_back', id: 'q1' },
    { action: 'text_on_wall', on: false },
    { action: 'remove_rule', id: 'k1' },
  ])
})

// Days you can throw (premium plan, Phase A): Me and Family are a native pager of whole days — a swipe is the
// scroller's own, so the test scrolls the pager a page and checks the day settles; tapping Me comes back to today.
const toPage = async (page, n) => page.evaluate((i) => {
  const row = document.querySelector('[data-day-pager]')
  row.scrollTo({ left: i * row.clientWidth, behavior: 'instant' })
  row.dispatchEvent(new Event('scrollend'))
}, n)
test('phone: swiping Me and Family moves the day; tapping Me comes back to today', async ({ page }) => {
  const phone = await open(page)
  await expect(phone.getByRole('heading', { name: "Jake's day" })).toBeVisible()
  await toPage(page, 1)
  await expect(phone.getByRole('heading', { name: "Jake's tomorrow" })).toBeVisible()
  await toPage(page, 2)
  await expect(phone.getByRole('heading', { name: "Jake's Sunday" })).toBeVisible()
  await phone.getByRole('button', { name: 'Me', exact: true }).click()
  await expect(phone.getByRole('heading', { name: "Jake's day" })).toBeVisible()

  await phone.getByRole('button', { name: 'Family' }).click()
  await expect(phone.getByRole('button', { name: 'Any day' })).toContainText('Friday, September 25')
  await toPage(page, 1)
  await expect(phone.getByRole('button', { name: 'Any day' })).toContainText('Saturday, September 26')
  await toPage(page, 0)
  await expect(phone.getByRole('button', { name: 'Any day' })).toContainText('Friday, September 25')
})

// P3.24 by improving Scan it (Jake, 2026-09-30): a match already on the calendar gets what's new added to it,
// never a second copy; what to bring or wear is packing for its event, not a 12 AM reminder.
test('phone: Scan it — something already on the calendar gets what’s new added to it, not a second copy', async ({ page }) => {
  const phone = await open(page, '2026-09-25T10:00:00&similar=1', 'jake-id')
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Scan it/ }).click()
  const sheet = phone.getByRole('region', { name: 'Scan it' })
  await sheet.locator('input[type=file]').first().setInputFiles({ name: 'flyer.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })
  await expect(sheet.getByText(/Already on your calendar: PTO Fall Festival · 11:00 AM\. I’ll add what’s new to it\./)).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Skip Palm Beach Public PTO Fall Festival' })).toHaveAttribute('aria-pressed', 'true')
  await sheet.getByRole('button', { name: 'Add 2' }).click()
  await expect(sheet.getByRole('list', { name: 'Added' }).getByText('Added what’s new to PTO Fall Festival')).toBeVisible()
  const plan = await page.evaluate(() => window.__scanPlan)
  expect(plan.items.map((i) => [i.kind, i.event_id])).toEqual([['event_details', 'pto']])
  expect(plan.items[0].changes.place).toBe('School field')
})

test('phone: Scan it — what to wear and bring is packing for the field trip, on it whether it’s new or already there', async ({ page }) => {
  let phone = await open(page, '2026-09-29T19:00:00&scan=trip', 'jake-id')
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Scan it/ }).click()
  let sheet = phone.getByRole('region', { name: 'Scan it' })
  await sheet.locator('input[type=file]').first().setInputFiles({ name: 'flyer.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })
  await expect(sheet.getByText('PACK THE NIGHT BEFORE')).toBeVisible()
  await expect(sheet.getByRole('button', { name: 'Skip Packed lunch' })).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-scan-trip.png')
  await sheet.getByRole('button', { name: 'Add 3' }).click()
  await expect(sheet.getByRole('list', { name: 'Added' }).getByText('Pack for Field Trip: Peter and the Wolf: Neon pink Kindergarten by the Sea shirt, Packed lunch')).toBeVisible()
  let plan = await page.evaluate(() => window.__scanPlan)
  expect(plan.items.map((i) => [i.kind, i.label])).toEqual([['pack', 'Neon pink Kindergarten by the Sea shirt'], ['pack', 'Packed lunch']])
  expect(plan.items[0].event_id).toMatch(/^added-/)

  // The school's field trip already on the calendar: the flyer's details go onto it, with the packing.
  phone = await open(page, '2026-09-29T19:00:00&scan=trip&similar=trip', 'jake-id')
  await phone.getByRole('button', { name: 'Add something' }).click()
  await phone.getByRole('region', { name: 'Add something' }).getByRole('button', { name: /Scan it/ }).click()
  sheet = phone.getByRole('region', { name: 'Scan it' })
  await sheet.locator('input[type=file]').first().setInputFiles({ name: 'flyer.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('fake') })
  await expect(sheet.getByText(/Already on your calendar: Field trip · .*I’ll add what’s new to it\./)).toBeVisible()
  await sheet.getByRole('button', { name: 'Add 3' }).click()
  await expect(sheet.getByRole('list', { name: 'Added' }).getByText('Added what’s new to Field trip')).toBeVisible()
  plan = await page.evaluate(() => window.__scanPlan)
  expect(plan.items.map((i) => [i.kind, i.event_id])).toEqual([['event_details', 'school-trip'], ['pack', 'school-trip'], ['pack', 'school-trip']])
  expect(plan.items[0].changes).toMatchObject({ place: 'Glazer Hall', people: ['Owen'] })
})

// To do on the phone (P3.22 step 7; the wall's canvas 10a–10d in one column): Week › To do, Jake's only.
const openTodoPhone = async (page) => {
  const phone = await open(page, '2026-09-25T13:10:00')
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: 'To do', exact: true }).click()
  await expect(phone.getByRole('heading', { name: 'To do' })).toBeVisible()
  return phone
}

test('phone: Week › To do — the projects shelf, Next up with what it takes, the rest folded (Jake’s phone only)', async ({ page }) => {
  const phone = await openTodoPhone(page)
  await expect(phone.getByText('PROJECTS · 3 GOING')).toBeVisible()
  await expect(phone.getByText('PROJECT · HIRED HELP')).toBeVisible()
  await expect(phone.getByText('was due Aug 24', { exact: true })).toBeVisible()
  await expect(page).toHaveScreenshot('phone-todo.png')
  // Done takes it off.
  await phone.getByRole('region', { name: 'Next up' }).getByRole('button', { name: 'Done' }).first().click()
  await expect(phone.getByText('Replace the outside GFI outlet')).toHaveCount(0)
  // A folded group opens in place.
  await phone.getByRole('button', { name: /^Quick ones/ }).click()
  await expect(phone.getByText('Look for a cable to fix the pool')).toBeVisible()
  // Kelly's phone has no To do.
  const kellys = await open(page, '2026-09-25T07:12:00', 'kelly')
  await kellys.getByRole('button', { name: 'Week' }).click()
  await expect(kellys.getByRole('button', { name: 'To do', exact: true })).toHaveCount(0)
})

// Overnight queue (3): a closed project on the phone, as on the wall — CLOSED in its parent, and a banner
// with Reopen on its own page.
test('phone: a closed project — CLOSED in its parent, a banner with Reopen on its page', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-09-25T13:10:00&viewer=jake-id&closedInside=1')
  const phone = page.getByTestId('phone-fixture')
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: 'To do', exact: true }).click()
  await phone.getByRole('button', { name: 'Open Paint the house' }).click()
  const paint = phone.getByRole('region', { name: 'Paint the house — project' })
  await paint.getByRole('button', { name: /^\d+ done$/ }).click()
  await expect(paint.getByText('CLOSED · MARIO’S DOING IT WITH THE PAINTING')).toBeVisible()
  await paint.getByRole('button', { name: 'Open', exact: true }).first().click()
  const stucco = phone.getByRole('region', { name: 'Stucco cracks: seal and patch — project' })
  await expect(stucco.getByText('CLOSED', { exact: true })).toBeVisible()
  await expect(stucco.getByRole('button', { name: 'Reopen' })).toBeVisible()
  await expect(stucco.getByText(/NOT GOING · CLOSED/)).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-project-closed.png')
})

// Jake, 2026-09-29: "where is the button to invoke AI on the project screen?"
test('phone: a project opens Ask Casa talking about it', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-09-25T13:10:00&viewer=jake-id&ask=empty')
  const phone = page.getByTestId('phone-fixture')
  await phone.getByRole('button', { name: 'Week' }).click()
  await phone.getByRole('button', { name: 'To do', exact: true }).click()
  await phone.getByRole('button', { name: 'Open Paint the house' }).click()
  await phone.getByRole('region', { name: 'Paint the house — project' }).getByRole('button', { name: 'Talk to Casa' }).click()
  const ask = phone.getByRole('region', { name: 'Ask Casa' })
  await expect(ask.getByText('Let’s work on the Paint the house project.')).toBeVisible()
})

test('phone: a project — Now, Then, the project inside; a step’s details with the phone’s own inputs; ↑ Earlier; add a step; settings', async ({ page }) => {
  const phone = await openTodoPhone(page)
  await phone.getByRole('button', { name: 'Open Paint the house' }).click()
  const project = phone.getByRole('region', { name: 'Paint the house — project' })
  await expect(project.getByText('NOW · ON YOUR PHONE · SIDE BY SIDE')).toBeVisible()
  await expect(project.getByText(/A project inside · 1 of 4/)).toBeVisible()
  await expect(page).toHaveScreenshot('phone-project.png')
  // A step's details: the cost typed; ↑ Earlier.
  await project.getByRole('button', { name: 'Open Take down shutters and house numbers' }).click()
  const step = phone.getByRole('region', { name: 'Take down shutters and house numbers — details' })
  await step.getByRole('textbox', { name: 'Notes' }).fill('Numbers go back after the painter')
  await step.getByLabel('Cost').fill('25')
  await step.getByLabel('Cost').blur()
  await step.getByRole('button', { name: '↑ Earlier' }).click()
  await step.getByRole('button', { name: 'Close' }).click()
  await expect(project.getByText(/1 hr · \$25 · Me/)).toBeVisible()
  // Add a step at the end.
  await project.getByRole('textbox', { name: 'A new step' }).fill('Buy tarps')
  await project.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(project.getByText('Buy tarps')).toBeVisible()
  // Done in Now.
  await project.getByRole('button', { name: 'Mark Pick colours: 3 sample pots done' }).click()
  await expect(project.getByText('4 of 10')).toBeVisible()
  // Settings: the same screen as the wall's.
  await project.getByRole('button', { name: 'Settings' }).click()
  const settings = phone.getByRole('region', { name: 'Project settings' })
  await settings.getByRole('button', { name: 'Everything in Now' }).click()
  await expect(settings.getByRole('button', { name: 'Everything in Now' })).toHaveAttribute('aria-pressed', 'true')
  await settings.getByRole('button', { name: 'Back to the plan' }).click()
  await project.getByRole('button', { name: '‹ To do' }).click()
  await expect(phone.getByRole('heading', { name: 'To do' })).toBeVisible()
})

test('phone: People › Family › Owen — his routines and what Casa knows; a parent edits, a child only reads (canvas 16c)', async ({ page }) => {
  let phone = await open(page, '2026-09-25T10:00:00', 'jake-id')
  await phone.getByRole('button', { name: 'More' }).click()
  await phone.getByRole('button', { name: /People/ }).click()
  await phone.getByRole('group', { name: 'Family' }).getByRole('button', { name: /Owen/ }).click()
  const page16 = phone.getByRole('region', { name: 'Owen’s page' })
  await expect(page16.getByText('School · Palm Beach Public')).toBeVisible()
  await expect(page16.getByText('His teacher is Mrs. Rosangela (Rose) Paine; the class is K by the Sea')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-person.png')
  await page16.getByRole('button', { name: 'Edit School · Palm Beach Public' }).click()
  await expect(page16.getByText('School routine')).toBeVisible()
  await expect(page16.getByText('Oct 12')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-routine-edit.png')

  phone = await open(page, '2026-09-25T10:00:00', 'liv')
  await phone.getByRole('button', { name: 'More' }).click()
  await phone.getByRole('button', { name: /People/ }).click()
  await phone.getByRole('group', { name: 'Family' }).getByRole('button', { name: /Owen/ }).click()
  await expect(phone.getByRole('region', { name: 'Owen’s page' }).getByText('School · Palm Beach Public')).toBeVisible()
  await expect(phone.getByRole('region', { name: 'Owen’s page' }).getByRole('button', { name: /^Edit/ })).toHaveCount(0)
})

// Canvas 21c (Jake, 2026-10-01, approved): the notice's "Talk it through" lands on Me — the same few sentences and
// answers as the wall's band, on the phone of the person it's for (Jake in Dallas, Thursday's 7:35 open).
test('phone: Casa wants to talk — on top of Me for Jake, not for Kelly; an answer settles it', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-10-07T15:05:00&viewer=jake-id&trip=1&talk=1')
  const phone = page.getByTestId('phone-fixture')
  await page.evaluate(() => document.fonts.ready)
  const talk = phone.getByRole('region', { name: 'Casa has something for you' })
  await expect(talk.getByText('JAKE, ABOUT TOMORROW MORNING')).toBeVisible()
  await expect(talk.getByText(/^You’re in Dallas tomorrow, and nobody’s taking Emme and Owen to .+ at 7:35\.$/)).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-talk.png')
  await talk.getByRole('button', { name: 'Giselle will' }).click()
  await expect(talk).toHaveCount(0)

  await page.goto('/__phone-fixture?at=2026-10-07T15:05:00&viewer=kelly&trip=1&talk=1')
  await page.evaluate(() => document.fonts.ready)
  await expect(phone.getByRole('heading', { level: 1 })).toBeVisible()
  await expect(phone.getByRole('region', { name: 'Casa has something for you' })).toHaveCount(0)
})

// The phone as an app, pass 1 (Jake's screen recording, Oct 1: the bottom bar floated and dropped as he swiped):
// the page under the frame can't scroll or bounce, so the bar stays on the bottom edge; a sheet dragged down closes.
const drag = async (page, selector, from, to) => page.evaluate(([sel, y0, y1]) => {
  const el = document.querySelector(sel)
  const r = el.getBoundingClientRect()
  const at = (y) => new Touch({ identifier: 1, target: el, clientX: r.left + r.width / 2, clientY: y })
  el.dispatchEvent(new TouchEvent('touchstart', { bubbles: true, touches: [at(y0)], changedTouches: [at(y0)] }))
  for (let y = y0; y <= y1; y += 20) el.dispatchEvent(new TouchEvent('touchmove', { bubbles: true, touches: [at(y)], changedTouches: [at(y)] }))
  el.dispatchEvent(new TouchEvent('touchend', { bubbles: true, touches: [], changedTouches: [at(y1)] }))
}, [selector, from, to])

test('phone: the frame never moves — the page itself can’t scroll; the bar sits on the bottom edge', async ({ page }) => {
  const phone = await open(page)
  expect(await page.evaluate(() => document.documentElement.classList.contains('phone-app'))).toBe(true)
  const moved = await page.evaluate(() => {
    window.scrollTo(0, 400)
    document.scrollingElement.scrollTop = 400
    return { y: window.scrollY, top: document.scrollingElement.scrollTop, body: getComputedStyle(document.body).position }
  })
  expect(moved).toEqual({ y: 0, top: 0, body: 'fixed' })
  // The frame reaches the bottom edge; the glass tab bar floats just above it.
  const frame = await page.locator('[data-phone-frame]').boundingBox()
  expect(Math.round(frame.y + frame.height)).toBe(844)
  const bar = await phone.getByRole('navigation', { name: 'Sections' }).boundingBox()
  expect(844 - Math.round(bar.y + bar.height)).toBeGreaterThanOrEqual(6)
  expect(844 - Math.round(bar.y + bar.height)).toBeLessThanOrEqual(16)
})

test('phone: a sheet dragged down from its top closes; a short drag springs back', async ({ page }) => {
  const phone = await open(page)
  await phone.getByRole('button', { name: 'Add something' }).click()
  const sheet = phone.getByRole('region', { name: 'Add something' })
  await expect(sheet).toBeVisible()
  const box = await sheet.boundingBox()
  await drag(page, 'section[aria-label="Add something"]', box.y + 20, box.y + 60)
  await page.waitForTimeout(300)
  await expect(sheet).toBeVisible()
  await drag(page, 'section[aria-label="Add something"]', box.y + 20, box.y + 220)
  await expect(sheet).toHaveCount(0)
})

// Canvas 30a (Jake, Oct 2: "an indicator of where we are time wise in the day … What's past should be obvious"):
// today's Family list splits at NOW; what's started sits above the line (two in view, the rest folded), finished
// ones faded; the next is lifted with how long until it; chores and to-dos tick.
test('phone: Family — the NOW line, what’s past folded and faded, the next lifted; a chore ticks', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-09-25T10:45:00&viewer=jake-id&chores=1')
  const phone = page.getByTestId('phone-fixture')
  await expect(phone).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await phone.getByRole('button', { name: /^Family/ }).first().click()
  await expect(phone.getByText('NOW · 10:45')).toBeVisible()
  await expect(phone.getByRole('button', { name: /earlier/ })).toBeVisible()
  // The first thing after 10:45, with how long until it; the 10:25 to-do not done yet is late, not faded.
  await expect(phone.getByText(/^In \d+ hr/).first()).toBeVisible()
  await expect(phone.getByText('Late · To do')).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-family-now.png')

  await phone.getByRole('button', { name: /earlier/ }).click()
  await expect(phone.getByRole('button', { name: /earlier/ })).toHaveCount(0)

  const meds = phone.getByRole('checkbox', { name: 'Done: Take meds' })
  await meds.click()
  await expect(meds).toHaveAttribute('aria-checked', 'true')
  await expect.poll(() => page.evaluate(() => window.__choreTicks ?? []), { timeout: 8000 }).toEqual(['+chore:meds:2026-09-25'])
})

// Canvas 30b (Jake, Oct 2: "a way to tap to open any date. Not just the 7 day window"): Any day opens the month; a
// tap picks a day and shows its first line; Open opens it on Family, weeks away included.
test('phone: Any day — the month, a day picked, opened on Family weeks away', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-09-25T10:45:00&viewer=jake-id')
  const phone = page.getByTestId('phone-fixture')
  await expect(phone).toBeVisible()
  await page.evaluate(() => document.fonts.ready)
  await phone.getByRole('button', { name: /^Week/ }).first().click()
  await phone.getByRole('button', { name: 'Any day' }).click()
  const month = phone.getByRole('region', { name: 'Any day' })
  await expect(month.getByRole('heading', { name: 'September 2026' })).toBeVisible()
  await expect(month.getByRole('button', { name: 'Open Today' })).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-month.png')

  await month.getByRole('button', { name: 'The month after' }).click()
  await expect(month.getByRole('heading', { name: 'October 2026' })).toBeVisible()
  await month.getByRole('button', { name: 'Thursday, October 15' }).click()
  await month.getByRole('button', { name: 'Open Thu 15' }).click()
  await expect(month).toHaveCount(0)
  await expect(phone.getByRole('heading', { name: 'Everyone' })).toBeVisible()
  await expect(phone.getByRole('button', { name: 'Any day' })).toContainText('October 15')
})

// Jake's phone, Oct 2, after a reload: iOS said the visible area was shorter than the window with no keyboard up; the
// frame ended short and the bar floated over a strip of page. A gap only counts while a field is being typed in.
test('phone: a short visual viewport with nothing being typed leaves the bar on the bottom edge', async ({ page }) => {
  await page.addInitScript(() => {
    const fake = new EventTarget()
    Object.assign(fake, { height: 700, width: 390, offsetTop: 0, offsetLeft: 0, pageTop: 0, pageLeft: 0, scale: 1 })
    Object.defineProperty(window, 'visualViewport', { value: fake, configurable: true })
  })
  const phone = await open(page)
  const frame = await page.locator('[data-phone-frame]').boundingBox()
  expect(Math.round(frame.y + frame.height)).toBe(844)
  await expect(phone.getByRole('navigation', { name: 'Sections' })).toBeVisible()
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--phone-kb').trim())).toBe('0px')
})

// Push and pop (premium plan, Phase A): an event's page comes in from the right; dragged from the left edge past a
// third of the width it goes back, a short drag springs home. Under a sheet the screen behind shrinks back.
test('phone: an event pushes in; a drag from the left edge takes it back; a sheet shrinks the screen behind', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-09-25T10:45:00&viewer=jake-id')
  const phone = page.getByTestId('phone-fixture')
  await expect(phone).toBeVisible()
  await phone.getByRole('button', { name: /^Family/ }).first().click()
  await phone.getByRole('button', { name: /Emme Practice Violin/ }).click()
  const eventPage = phone.getByRole('region', { name: /on the phone$/ })
  await expect(eventPage).toBeVisible()
  await page.waitForTimeout(700)
  // A short drag springs home.
  await page.mouse.move(6, 420)
  await page.mouse.down()
  await page.mouse.move(60, 420, { steps: 6 })
  await page.mouse.up()
  await page.waitForTimeout(700)
  await expect(eventPage).toBeVisible()
  // Past a third of the width: back to Family.
  await page.mouse.move(6, 420)
  await page.mouse.down()
  await page.mouse.move(250, 420, { steps: 12 })
  await page.mouse.up()
  await expect(eventPage).toHaveCount(0)
  await expect(phone.getByRole('heading', { name: 'Everyone' })).toBeVisible()

  await phone.getByRole('button', { name: 'Add something' }).click()
  await expect(page.locator('.phone-behind-sheet')).toHaveCount(1)
  await page.keyboard.press('Escape')
})

// Phase B (premium plan): scrolled past the big title, a small one shows in a frosted bar at the top.
test('phone: scrolling down tucks the title into a small frosted bar', async ({ page }) => {
  await page.goto('/__phone-fixture?at=2026-09-25T10:45:00&viewer=jake-id')
  const phone = page.getByTestId('phone-fixture')
  await expect(phone).toBeVisible()
  await phone.getByRole('button', { name: /^Week/ }).first().click()
  await phone.getByRole('group', { name: 'Week, Coming up or To do' }).getByRole('button', { name: 'To do' }).click()
  const bar = page.locator('.phone-tucked')
  await expect(bar).toHaveClass(/opacity-0/)
  // The To do list scrolls in the page itself (main).
  const scrolled = await page.evaluate(() => { const m = document.querySelector('main'); m.scrollTo({ top: 240 }); m.dispatchEvent(new Event('scroll', { bubbles: true })); return m.scrollTop })
  expect(scrolled).toBeGreaterThan(64)
  await expect(bar).toHaveClass(/opacity-100/)
  await expect(bar).toContainText('To do')
})

test('phone: Groceries — by aisle with the amount by the name; ticks wait, then leave together; add a few at once', async ({ page }) => {
  const phone = await open(page, '2026-09-25T10:45:00')
  await phone.getByRole('button', { name: /^More/ }).first().click()
  await phone.getByRole('button', { name: /Groceries/ }).click()
  const list = phone.getByRole('region', { name: 'Groceries' })
  await expect(list.getByText('5 to get')).toBeVisible()
  await expect(list.getByRole('heading', { name: 'PRODUCE' })).toBeVisible()
  await expect(list.getByRole('button', { name: 'Avocados, 3' })).toBeVisible()
  await expect(list.getByRole('button', { name: 'Milk, 2%, 1 gallon' })).toBeVisible()
  // Two ticks in a row: both stay in place, ticked, then leave together after the pause.
  await list.getByRole('button', { name: 'Bananas' }).click()
  await list.getByRole('button', { name: 'Avocados, 3' }).click()
  await expect(list.getByRole('button', { name: 'Bananas, got it' })).toBeVisible()
  await expect(list.getByRole('status').getByText('2 ticked')).toBeVisible()
  await expect(list.getByRole('heading', { name: 'PRODUCE' })).toBeHidden({ timeout: 5000 })
  await expect(list.getByRole('button', { name: /Got · 3/ })).toBeVisible()
  // Adding from the bottom: "eggs, milk" — eggs is new (dairy), milk was on already.
  await list.getByRole('button', { name: 'Add to groceries' }).click()
  const add = phone.getByRole('region', { name: 'Add to groceries' })
  await add.getByRole('textbox', { name: 'What to add' }).fill('eggs, milk')
  await add.getByRole('button', { name: 'Add', exact: true }).click()
  await expect(add.getByText(/Added eggs.*was on already/i)).toBeVisible()
  await expect(list.getByRole('button', { name: /^eggs$/i })).toBeVisible()
  await expect(phone).toHaveScreenshot('phone-groceries-add.png')
})
